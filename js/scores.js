// Local leaderboard. Kept in localStorage: no server, no accounts, per device.
const KEY = 'rr.scores';
const NAME_KEY = 'rr.name';
export const MAX_ENTRIES = 10;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

export function list() { return read(); }

export function qualifies(score) {
  if (score <= 0) return false;
  const l = read();
  return l.length < MAX_ENTRIES || score > l[l.length - 1].score;
}

/** Adds an entry and returns its 1-based rank (or 0 if it did not make the cut). */
export function add({ name, score, wave, kills }) {
  if (score <= 0) return 0;
  const entry = {
    name: (name || 'Pemburu').slice(0, 14),
    score, wave, kills,
    date: new Date().toISOString().slice(0, 10),
  };
  const l = read();
  l.push(entry);
  l.sort((a, b) => b.score - a.score || b.wave - a.wave);
  const trimmed = l.slice(0, MAX_ENTRIES);
  write(trimmed);
  const rank = trimmed.indexOf(entry) + 1;
  return rank;
}

export function clear() { write([]); }

export function lastName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function rememberName(n) {
  try { localStorage.setItem(NAME_KEY, (n || '').slice(0, 14)); } catch { /* ignore */ }
}
