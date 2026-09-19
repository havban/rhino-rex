/**
 * Notices when a new build has been published and offers a reload.
 *
 * No service worker: the deploy workflow writes `version.json` and stamps the
 * same commit into `<meta name="build">`. The page compares the two, so it
 * knows the difference between "a new build exists" and "I am that build".
 *
 * Reloading uses a cache-busting query rather than location.reload(), because
 * GitHub Pages serves max-age=600 and a plain reload can hand back the very
 * JavaScript we are trying to replace.
 */

const POLL = 5 * 60 * 1000;      // a static site does not ship that often
const FILE = 'version.json';

export function currentBuild() {
  const meta = document.querySelector('meta[name="build"]');
  const v = meta ? meta.getAttribute('content') : '';
  return v && !v.startsWith('__') ? v : '';    // unreplaced placeholder = dev
}

async function fetchBuild() {
  try {
    const res = await fetch(`${FILE}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return '';
    const body = await res.json();
    return (body && body.build) || '';
  } catch {
    return '';                                  // offline: not an update
  }
}

/**
 * Calls `onUpdate(build)` once, when a different build is published.
 * Does nothing locally, where there is no stamped build to compare against.
 */
export function watch(onUpdate) {
  const mine = currentBuild();
  if (!mine) return () => {};

  let stopped = false;
  let told = false;

  const check = async () => {
    if (stopped || told) return;
    const live = await fetchBuild();
    if (live && live !== mine) {
      told = true;
      onUpdate(live);
    }
  };

  const timer = setInterval(check, POLL);
  // coming back to the tab is the likeliest moment for a deploy to have landed
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setTimeout(check, 20000);

  return () => { stopped = true; clearInterval(timer); };
}

/**
 * Point the menu's source link at the exact commit that is running.
 * AGPL section 13 asks network users to be offered *this* version's source,
 * not whatever happens to be on the default branch today.
 */
export function stampSourceLink(repo) {
  const el = document.getElementById('src-link');
  const build = currentBuild();
  if (!el || !build) return;
  el.href = `${repo}/tree/${build}`;
  el.title = `Kode sumber build ${build}`;
}

/** Reload onto the new build, stepping around the CDN cache. */
export function reload(build) {
  const url = new URL(location.href);
  url.searchParams.set('v', build || Date.now().toString(36));
  location.replace(url.toString());
}
