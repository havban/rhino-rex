/**
 * Usage statistics — two independent halves.
 *
 *  1. A local tally in localStorage. Always on, never leaves the device.
 *     Inspect it in-game with ?stats=1 (or call window.__stats() in the console).
 *
 *  2. Aggregate counters sent to GoatCounter. The official snippet lives in
 *     index.html:
 *
 *       <script data-goatcounter="https://havban.goatcounter.com/count"
 *               async src="//gc.zgo.at/count.js"></script>
 *
 *     That script counts the page view by itself; this module adds the custom
 *     events (waves reached, score bracket, favourite weapon, boss kills)
 *     through window.goatcounter.count(). The endpoint is read from the tag,
 *     so it is configured in exactly one place.
 *
 * Only counters are sent — no ids, no cookies, no personal data — and
 * GoatCounter honours Do Not Track. Remove the tag from index.html to turn all
 * of it off; the local panel keeps working. To use a different provider,
 * remove the tag and set window.__rrTrack = (path, title, isEvent) => {...}.
 *
 * Dashboard: https://havban.goatcounter.com (Settings -> private, so only you
 * can read it).
 */

const SITE_TITLE = 'Rhino Rex';
const SCRIPT_TIMEOUT = 6000;     // if count.js never arrives, fall back to a pixel

let blocked = false;
const queue = [];

const doNotTrack = () =>
  navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;

/** The /count URL, taken from the GoatCounter script tag in index.html. */
function endpoint() {
  const tag = document.querySelector('script[data-goatcounter]');
  return tag ? tag.getAttribute('data-goatcounter') : '';
}

const scriptReady = () => typeof window.goatcounter?.count === 'function';

// Last-ditch path: the script was blocked, so hit the endpoint directly.
function pixel(path, title, isEvent) {
  const url = endpoint();
  if (!url || doNotTrack()) return;
  try {
    const u = new URL(url);
    u.searchParams.set('p', path);
    u.searchParams.set('t', title || path);
    if (isEvent) u.searchParams.set('e', 'true');
    u.searchParams.set('r', document.referrer || '');
    u.searchParams.set('s', [screen.width, screen.height, devicePixelRatio || 1].join(','));
    u.searchParams.set('rnd', Math.random().toString(36).slice(2, 10));
    new Image().src = u.toString();
  } catch { /* analytics must never break the game */ }
}

function deliver(path, title, isEvent) {
  if (window.__rrTrack) { window.__rrTrack(path, title, isEvent); return; }
  if (scriptReady()) { window.goatcounter.count({ path, title: title || path, event: isEvent }); return; }
  if (blocked) { pixel(path, title, isEvent); return; }
  queue.push([path, title, isEvent]);
}

function flush() {
  while (queue.length) {
    const [path, title, isEvent] = queue.shift();
    if (window.__rrTrack) window.__rrTrack(path, title, isEvent);
    else if (scriptReady()) window.goatcounter.count({ path, title: title || path, event: isEvent });
    else pixel(path, title, isEvent);
  }
}

/** Waits for count.js, then drains anything the game logged while it loaded. */
export function install() {
  if (scriptReady()) { flush(); return; }
  const started = Date.now();
  const tick = () => {
    if (scriptReady()) { flush(); return; }
    if (Date.now() - started > SCRIPT_TIMEOUT) {
      blocked = true;                 // ad blocker, offline, or no tag at all
      if (endpoint() && !window.__rrTrack) pixel(location.pathname || '/', SITE_TITLE, false);
      flush();
      return;
    }
    setTimeout(tick, 250);
  };
  tick();
}

/** The page view is counted by count.js itself; this is only for the fallback. */
export function pageview() {
  if (window.__rrTrack) window.__rrTrack(location.pathname || '/', SITE_TITLE, false);
}

export function event(name, title) {
  deliver(name, title || name, true);
}

const STATS_KEY = 'rr.stats';
const VISIT_KEY = 'rr.visit';

// ---------------------------------------------------------------- buckets --
// Sent as event names, so the dashboard shows a distribution instead of a
// long tail of unique numbers.
const waveBucket = (w) =>
  w >= 20 ? '20+' : w >= 15 ? '15-19' : w >= 10 ? '10-14' : w >= 5 ? '5-9' : String(Math.max(1, w));

const scoreBucket = (s) =>
  s >= 50000 ? '50k+' : s >= 20000 ? '20k-50k' : s >= 10000 ? '10k-20k'
  : s >= 5000 ? '5k-10k' : s >= 2000 ? '2k-5k' : s >= 500 ? '500-2k' : 'under-500';

// ---------------------------------------------------------------- visitors --
/**
 * GoatCounter already de-duplicates *visits* server-side (a daily hash of IP +
 * user agent), which is the "Visits" figure in the dashboard. What it cannot
 * know is whether a browser has been here before, so we add that ourselves.
 *
 * No identifier is stored - only a first-seen date, a last-seen date and a
 * count of distinct days - and at most one pair of events is sent per device
 * per day, so the numbers read as "unique devices today".
 */
const dayBucket = (days) =>
  days >= 20 ? '20+' : days >= 6 ? '6-19' : days >= 2 ? '2-5' : '1';

function readVisit() {
  try {
    const raw = JSON.parse(localStorage.getItem(VISIT_KEY) || 'null');
    if (raw && raw.first && raw.last) return raw;
  } catch { /* private mode */ }
  return null;
}

export function visitor() {
  return readVisit() || { first: null, last: null, days: 0 };
}

/** Call once per page load. Returns the (updated) visitor record. */
export function trackVisitor() {
  const today = new Date().toISOString().slice(0, 10);
  const prev = readVisit();
  let rec;
  let fire = null;

  if (!prev) {
    rec = { first: today, last: today, days: 1 };
    fire = ['visitor-new', 'Pengunjung baru'];
  } else if (prev.last !== today) {
    rec = { first: prev.first, last: today, days: (prev.days || 1) + 1 };
    fire = ['visitor-returning', 'Pengunjung kembali'];
  } else {
    return prev;                       // already counted today; stay quiet
  }

  try { localStorage.setItem(VISIT_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
  event(fire[0], fire[1]);
  if (rec.days > 1) event(`hari-aktif-${dayBucket(rec.days)}`, `Hari aktif: ${dayBucket(rec.days)}`);
  return rec;
}

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

export function resetStats() {
  writeStats({ ...EMPTY });
  try { localStorage.removeItem(VISIT_KEY); } catch { /* ignore */ }
}

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
  const v = visitor();
  const w = s.weapons;
  const totalHits = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const row = (k, v) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`;
  el.innerHTML = `
    <h4>Statistik lokal <button id="stats-close" title="Tutup">×</button></h4>
    <table>
      ${row('Sejak', v.first || s.firstSeen || '—')}
      ${row('Kunjungan terakhir', v.last || '—')}
      ${row('Hari aktif', v.days || 0)}
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
    <p>${endpoint() ? `Kiriman agregat: ${endpoint()}` : 'Kiriman agregat: nonaktif (tag GoatCounter tidak ada)'}</p>`;
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
