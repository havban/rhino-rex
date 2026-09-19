/**
 * Rhino Rex - global leaderboard API (Cloudflare Worker + D1).
 *
 *   POST /run     -> { token }          issued when a run starts
 *   POST /scores  -> { ok, rank }       submit a finished run
 *   GET  /scores  -> { scores: [...] }  top N, edge-cached
 *   GET  /health  -> { ok }
 *
 * The browser never holds a database credential: this Worker is the only thing
 * that can write. It cannot make a client-side game honest, but it rejects the
 * lazy forgeries - impossible score/kill combinations, runs that finished
 * faster than the waves they claim, submissions without a signed token from an
 * actual game start - and rate-limits per IP.
 */

const MAX_NAME = 14;
const TOP_LIMIT = 50;
const SUBMITS_PER_HOUR = 6;
const TOKEN_MAX_AGE = 6 * 3600;        // a run claiming to be older than this is junk

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ipHash(req, secret) {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(secret + ':' + ip));
  return hex(digest).slice(0, 32);      // truncated hash only, never the address
}

// --------------------------------------------------------------- plausibility
// Mirrors js/config.js: wave N spawns min(4 + floor(N * 1.4), 16) rhinos, plus
// a matriarch every fifth wave.
function spawnedThrough(wave) {
  let total = 0;
  for (let i = 1; i <= wave; i++) total += Math.min(4 + Math.floor(i * 1.4), 16) + (i % 5 === 0 ? 1 : 0);
  return total;
}

// Best case: every kill a matriarch (900) at the top combo multiplier (x2),
// plus the 120 * wave clear bonus for every wave, plus slack.
function maxScore(wave, kills) {
  return kills * 1800 + 120 * (wave * (wave + 1)) / 2 + 1000;
}

function validate(run) {
  const { name, score, wave, kills, seconds } = run;
  if (![score, wave, kills, seconds].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return 'angka tidak valid';
  }
  if (score <= 0 || score > 50000000) return 'skor di luar rentang';
  if (wave < 1 || wave > 500) return 'gelombang di luar rentang';
  if (kills < 0 || kills > 40000) return 'jumlah badak di luar rentang';
  if (seconds < 0 || seconds > 24 * 3600) return 'durasi di luar rentang';
  if (kills > spawnedThrough(wave)) return 'badak lebih banyak daripada yang pernah muncul';
  if (score > maxScore(wave, kills)) return 'skor tidak mungkin untuk gelombang/badak itu';
  if (seconds < 5 * (wave - 1)) return 'durasi terlalu singkat untuk gelombang itu';
  if (name != null && typeof name !== 'string') return 'nama tidak valid';
  return null;
}

function cleanName(name) {
  const stripped = String(name || '')
    .split('')
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c > 31 && c !== 127 && ch !== '<' && ch !== '>';
    })
    .join('')
    .trim()
    .slice(0, MAX_NAME);
  return stripped || 'Pemburu';
}

// ------------------------------------------------------------------ plumbing
function cors(env, req) {
  const allow = env.ALLOW_ORIGIN || '*';
  const origin = req.headers.get('Origin') || '';
  const list = allow.split(',').map((s) => s.trim());
  const value = allow === '*' ? '*' : (list.includes(origin) ? origin : '');
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, init = {}, extra = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra, ...(init.headers || {}) },
  });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const head = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    if (!head['Access-Control-Allow-Origin']) return json({ error: 'origin ditolak' }, { status: 403 }, head);

    const secret = env.RUN_SECRET || 'dev-secret-change-me';

    try {
      if (url.pathname === '/health') return json({ ok: true }, {}, head);

      // ---- top scores ----------------------------------------------------
      if (req.method === 'GET' && url.pathname === '/scores') {
        const asked = parseInt(url.searchParams.get('limit') || '20', 10);
        const limit = Math.min(Math.max(Number.isFinite(asked) ? asked : 20, 1), TOP_LIMIT);
        const { results } = await env.DB
          .prepare('SELECT name, score, wave, kills, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?')
          .bind(limit)
          .all();
        return json({ scores: results || [] }, {}, { ...head, 'Cache-Control': 'public, max-age=20' });
      }

      // ---- start of a run: hand out a signed token -----------------------
      if (req.method === 'POST' && url.pathname === '/run') {
        const t0 = Math.floor(Date.now() / 1000);
        const nonce = hex(crypto.getRandomValues(new Uint8Array(8)));
        const sig = await hmac(secret, t0 + '.' + nonce);
        return json({ token: t0 + '.' + nonce + '.' + sig }, {}, head);
      }

      // ---- submit a finished run ------------------------------------------
      if (req.method === 'POST' && url.pathname === '/scores') {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: 'body bukan JSON' }, { status: 400 }, head);

        const parts = String(body.token || '').split('.');
        const [t0, nonce, sig] = parts;
        if (parts.length !== 3 || !t0 || !nonce || !sig) return json({ error: 'token hilang' }, { status: 400 }, head);
        if (!safeEqual(sig, await hmac(secret, t0 + '.' + nonce))) {
          return json({ error: 'token tidak sah' }, { status: 403 }, head);
        }
        const now = Math.floor(Date.now() / 1000);
        const age = now - Number(t0);
        if (!Number.isFinite(age) || age < 0 || age > TOKEN_MAX_AGE) {
          return json({ error: 'token kedaluwarsa' }, { status: 403 }, head);
        }
        // a run cannot have lasted longer than the token has existed
        if (Number(body.seconds) > age + 60) return json({ error: 'durasi melebihi umur token' }, { status: 400 }, head);

        const why = validate(body);
        if (why) return json({ error: why }, { status: 400 }, head);

        const who = await ipHash(req, secret);
        const recent = await env.DB
          .prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
          .bind(who, now - 3600)
          .first();
        if ((recent && recent.n || 0) >= SUBMITS_PER_HOUR) {
          return json({ error: 'terlalu sering mengirim, coba lagi nanti' }, { status: 429 }, head);
        }

        const name = cleanName(body.name);
        await env.DB
          .prepare('INSERT INTO scores (name, score, wave, kills, seconds, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(name, Math.round(body.score), Math.round(body.wave), Math.round(body.kills), Math.round(body.seconds), now, who)
          .run();

        const above = await env.DB
          .prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?')
          .bind(Math.round(body.score))
          .first();
        return json({ ok: true, rank: (above && above.n || 0) + 1, name }, {}, head);
      }

      return json({ error: 'tidak ditemukan' }, { status: 404 }, head);
    } catch (err) {
      return json({ error: 'kesalahan server', detail: String((err && err.message) || err) }, { status: 500 }, head);
    }
  },
};
