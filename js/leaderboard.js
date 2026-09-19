/**
 * Global leaderboard client.
 *
 * Talks to the Cloudflare Worker in worker/ (see worker/README.md). Until API
 * is filled in, available() is false and the game quietly stays on the local
 * board — every call here fails soft, so a dead or slow API can never block
 * the game.
 */

export const API = '';        // e.g. 'https://rhino-rex-scores.<you>.workers.dev'

const TIMEOUT = 6000;
let token = null;             // signed at run start, spent on submit

export function base() {
  return (typeof window !== 'undefined' && window.__RR_API) || API || '';
}

export function available() { return !!base(); }

async function call(path, options = {}) {
  const root = base();
  if (!root) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(root.replace(/\/$/, '') + path, { ...options, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: (body && body.error) || `HTTP ${res.status}`, status: res.status };
    return body;
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'waktu habis' : 'jaringan gagal' };
  } finally {
    clearTimeout(timer);
  }
}

/** Ask for a run token when a game starts; failure just disables submitting. */
export async function beginRun() {
  token = null;
  const out = await call('/run', { method: 'POST' });
  if (out && out.token) token = out.token;
  return !!token;
}

export async function top(limit = 20) {
  const out = await call(`/scores?limit=${limit}`);
  if (!out || out.error) return { error: (out && out.error) || 'tidak aktif', scores: null };
  return { scores: out.scores || [] };
}

export async function submit(entry) {
  if (!token) return { error: 'tidak ada token permainan' };
  const out = await call('/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry, token }),
  });
  token = null;                              // one submission per run
  if (!out || out.error) return { error: (out && out.error) || 'gagal mengirim' };
  return { rank: out.rank, name: out.name };
}
