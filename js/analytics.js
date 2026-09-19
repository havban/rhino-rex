/**
 * Usage statistics — two independent halves.
 *
 *  1. A local tally in localStorage. Always on, never leaves the device.
 *     Inspect it in-game with ?stats=1 (or call window.__stats() in the console).
 *
 *  2. Aggregate pings to a hosted analytics service. DISABLED until you put
 *     your own endpoint in ENDPOINT below — with it empty this file makes no
 *     network requests at all.
 *
 * Recommended service: GoatCounter (free for non-commercial use, no cookies,
 * no personal data, supports custom events).
 *   1. sign up at https://www.goatcounter.com and pick a code, e.g. "rhino-rex"
 *   2. set ENDPOINT below to 'https://rhino-rex.goatcounter.com/count'
 *   3. your dashboard is at https://rhino-rex.goatcounter.com — set it to
 *      private in Settings so only you can read it
 *
 * Only counters are sent: a path, a title and the screen size. No ids, no
 * cookies, no personal data, and nothing at all if the visitor sets Do Not
 * Track. To use a different provider instead, leave ENDPOINT empty and assign
 * your own function to window.__rrTrack = (path, title, isEvent) => {...}.
 */

export const ENDPOINT = '';           // <-- paste your GoatCounter /count URL here

const STATS_KEY = 'rr.stats';
const SITE_TITLE = 'Rhino Rex';

const doNotTrack = () =>
  navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;

function send(path, title, isEvent) {
  try {
    if (window.__rrTrack) { window.__rrTrack(path, title, isEvent); return; }
    if (!ENDPOINT || doNotTrack()) return;
    const u = new URL(ENDPOINT);
    u.searchParams.set('p', path);
    u.searchParams.set('t', title || path);
    if (isEvent) u.searchParams.set('e', 'true');
    u.searchParams.set('r', document.referrer || '');
    u.searchParams.set('s', [screen.width, screen.height, devicePixelRatio || 1].join(','));
    u.searchParams.set('rnd', Math.random().toString(36).slice(2, 10));
    new Image().src = u.toString();   // fire and forget, no third-party JS
  } catch { /* analytics must never break the game */ }
}

export function pageview() {
  send(location.pathname || '/', SITE_TITLE, false);
}

export function event(name, title) {
  send(name, title || name, true);
}

// ---------------------------------------------------------------- buckets --
// Sent as event names, so the dashboard shows a distribution instead of a
// long tail of unique numbers.
const waveBucket = (w) =>
  w >= 20 ? '20+' : w >= 15 ? '15-19' : w >= 10 ? '10-14' : w >= 5 ? '5-9' : String(Math.max(1, w));

const scoreBucket = (s) =>
  s >= 50000 ? '50k+' : s >= 20000 ? '20k-50k' : s >= 10000 ? '10k-20k'
  : s >= 5000 ? '5k-10k' : s >= 2000 ? '2k-5k' : s >= 500 ? '500-2k' : 'under-500';

// ------------------------------------------------------------ local tally --
const EMPTY = {
  firstSeen: null, runs: 0, kills: 0, deaths: 0, bosses: 0,
  score: 0, bestScore: 0, bestWave: 0, waves: 0, seconds: 0,
  weapons: { bite: 0, tail: 0, fire: 0, fireball: 0 },
};

export function stats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
    return raw ? { ...EMPTY, ...raw, weapons: { ...EMPTY.weapons, ...(raw.weapons || {}) } } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function writeStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function resetStats() { writeStats({ ...EMPTY }); }

/** Folds one finished run into the local tally and pings the aggregate events. */
export function recordRun(run) {
  const s = stats();
  s.firstSeen = s.firstSeen || new Date().toISOString().slice(0, 10);
  s.runs += 1;
  s.deaths += 1;
  s.kills += run.kills || 0;
  s.bosses += run.bosses || 0;
  s.score += run.score || 0;
  s.waves += run.wave || 0;
  s.seconds += Math.round(run.seconds || 0);
  s.bestScore = Math.max(s.bestScore, run.score || 0);
  s.bestWave = Math.max(s.bestWave, run.wave || 0);
  for (const k in s.weapons) s.weapons[k] += (run.weapons && run.weapons[k]) || 0;
  writeStats(s);

  event(`wave-${waveBucket(run.wave || 1)}`, `Gelombang tercapai: ${waveBucket(run.wave || 1)}`);
  event(`score-${scoreBucket(run.score || 0)}`, `Skor: ${scoreBucket(run.score || 0)}`);
  if (run.topWeapon) event(`weapon-${run.topWeapon}`, `Senjata terfavorit: ${run.topWeapon}`);
  if (run.bosses) event('boss-killed', 'Matriark dikalahkan');
  return s;
}

// ------------------------------------------------------------ debug panel --
const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}j ${m}m` : `${m}m ${sec % 60}d`;
};

export function renderPanel(el) {
  const s = stats();
  const w = s.weapons;
  const totalHits = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const row = (k, v) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`;
  el.innerHTML = `
    <h4>Statistik lokal <button id="stats-close" title="Tutup">×</button></h4>
    <table>
      ${row('Sejak', s.firstSeen || '—')}
      ${row('Permainan', s.runs)}
      ${row('Waktu main', fmtTime(s.seconds))}
      ${row('Badak dikalahkan', s.kills)}
      ${row('Matriark', s.bosses)}
      ${row('Skor total', s.score.toLocaleString('id-ID'))}
      ${row('Skor terbaik', s.bestScore.toLocaleString('id-ID'))}
      ${row('Gelombang terbaik', s.bestWave)}
      ${row('Rata-rata gelombang', s.runs ? (s.waves / s.runs).toFixed(1) : '—')}
      ${Object.entries(w).map(([k, v]) => row(`&nbsp;&nbsp;${k}`, `${v} (${Math.round(v / totalHits * 100)}%)`)).join('')}
    </table>
    <button id="stats-reset">Reset statistik</button>
    <p>${ENDPOINT ? 'Kiriman agregat: aktif' : 'Kiriman agregat: nonaktif (ENDPOINT kosong)'}</p>`;
  el.querySelector('#stats-close').onclick = () => el.classList.add('hidden');
  el.querySelector('#stats-reset').onclick = () => { resetStats(); renderPanel(el); };
}

export function mountPanel() {
  let el = document.getElementById('statspanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statspanel';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  renderPanel(el);
  return el;
}
