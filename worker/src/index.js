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
// Mirrors WAVES.count() in js/config.js: wave N spawns
// min(3 + floor((N - 1) * 1.1), 16) rhinos, plus a matriarch every fifth wave.
// KEEP THIS IN SYNC — if the game's curve changes and this does not, the check
// either rejects honest scores or stops catching forged ones.
function spawnedThrough(wave) {
  let total = 0;
  for (let i = 1; i <= wave; i++) total += Math.min(3 + Math.floor((i - 1) * 1.1), 16) + (i % 5 === 0 ? 1 : 0);
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


// ------------------------------------------------------- multiplayer rooms
// Signalling only: two peers swap an SDP offer/answer through these rows and
// then talk to each other directly. Plain polling, so no Durable Objects and
// no WebSockets are needed - it runs on the free plan.
const ROOM_TTL = 2 * 3600;          // rooms older than this are swept away
const CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXY3468';

function roomCode() {
  let out = '';
  const r = crypto.getRandomValues(new Uint8Array(4));
  for (let i = 0; i < 4; i++) out += CODE_CHARS[r[i] % CODE_CHARS.length];
  return out;
}

const peerId = () => hex(crypto.getRandomValues(new Uint8Array(8)));

async function sweep(env, now) {
  // cheap opportunistic cleanup; no cron needed
  if (Math.random() > 0.08) return;
  await env.DB.prepare('DELETE FROM rooms WHERE seen_at < ?').bind(now - ROOM_TTL).run();
  await env.DB.prepare('DELETE FROM peers WHERE created_at < ?').bind(now - ROOM_TTL).run();
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


      // ---- multiplayer signalling -----------------------------------------
      if (url.pathname.startsWith('/mp/')) {
        const now = Math.floor(Date.now() / 1000);
        await sweep(env, now);
        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        const seg = url.pathname.split('/').filter(Boolean);   // ['mp', ...]

        // host opens a room -> { code, host }
        if (req.method === 'POST' && seg[1] === 'room' && seg.length === 2) {
          const host = peerId();
          for (let tries = 0; tries < 6; tries++) {
            const code = roomCode();
            const clash = await env.DB.prepare('SELECT code FROM rooms WHERE code = ?').bind(code).first();
            if (clash) continue;
            await env.DB
              .prepare('INSERT INTO rooms (code, host, name, created_at, seen_at) VALUES (?, ?, ?, ?, ?)')
              .bind(code, host, cleanName(body.name), now, now)
              .run();
            return json({ code, host }, {}, head);
          }
          return json({ error: 'kode room habis, coba lagi' }, { status: 503 }, head);
        }

        // guest knocks on the door -> { peer }
        if (req.method === 'POST' && seg[1] === 'join' && seg[2]) {
          const code = seg[2].toUpperCase();
          const room = await env.DB.prepare('SELECT code, closed FROM rooms WHERE code = ?').bind(code).first();
          if (!room) return json({ error: 'room tidak ditemukan' }, { status: 404 }, head);
          if (room.closed) return json({ error: 'room sudah ditutup' }, { status: 410 }, head);
          const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM peers WHERE code = ?').bind(code).first();
          if ((count && count.n || 0) >= 8) return json({ error: 'room penuh' }, { status: 409 }, head);
          const id = peerId();
          await env.DB
            .prepare('INSERT INTO peers (id, code, name, created_at) VALUES (?, ?, ?, ?)')
            .bind(id, code, cleanName(body.name), now)
            .run();
          return json({ peer: id }, {}, head);
        }

        // host polls for guests waiting for an offer
        if (req.method === 'GET' && seg[1] === 'peers' && seg[2]) {
          const code = seg[2].toUpperCase();
          await env.DB.prepare('UPDATE rooms SET seen_at = ? WHERE code = ?').bind(now, code).run();
          const { results } = await env.DB
            .prepare('SELECT id, name, offer IS NOT NULL AS offered, answer IS NOT NULL AS answered, answer FROM peers WHERE code = ? ORDER BY created_at')
            .bind(code)
            .all();
          return json({ peers: results || [] }, {}, head);
        }

        // host posts its offer for one guest / guest posts its answer
        if (req.method === 'POST' && seg[1] === 'sdp' && seg[2]) {
          const id = seg[2];
          const row = await env.DB.prepare('SELECT id FROM peers WHERE id = ?').bind(id).first();
          if (!row) return json({ error: 'peer tidak dikenal' }, { status: 404 }, head);
          const sdp = String(body.sdp || '');
          if (sdp.length > 60000) return json({ error: 'sdp terlalu besar' }, { status: 413 }, head);
          const col = body.kind === 'answer' ? 'answer' : 'offer';
          await env.DB.prepare(`UPDATE peers SET ${col} = ? WHERE id = ?`).bind(sdp, id).run();
          return json({ ok: true }, {}, head);
        }

        // guest polls for the offer aimed at it
        if (req.method === 'GET' && seg[1] === 'sdp' && seg[2]) {
          const row = await env.DB.prepare('SELECT offer, answer, code FROM peers WHERE id = ?').bind(seg[2]).first();
          if (!row) return json({ error: 'peer tidak dikenal' }, { status: 404 }, head);
          const room = await env.DB.prepare('SELECT closed FROM rooms WHERE code = ?').bind(row.code).first();
          return json({ offer: row.offer || null, answer: row.answer || null, closed: !!(room && room.closed) }, {}, head);
        }

        // host closes the room once everyone is connected (or on quit)
        if (req.method === 'POST' && seg[1] === 'close' && seg[2]) {
          await env.DB.prepare('UPDATE rooms SET closed = 1 WHERE code = ?').bind(seg[2].toUpperCase()).run();
          return json({ ok: true }, {}, head);
        }

        return json({ error: 'rute mp tidak dikenal' }, { status: 404 }, head);
      }

      return json({ error: 'tidak ditemukan' }, { status: 404 }, head);
    } catch (err) {
      return json({ error: 'kesalahan server', detail: String((err && err.message) || err) }, { status: 500 }, head);
    }
  },
};
