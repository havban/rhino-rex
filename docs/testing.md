# Testing

There is no unit-test suite. The game is tested by **driving the real thing in
a real browser** with Playwright and asserting on state exposed through
`window.__game`, plus screenshots for anything visual and offline audio
rendering for anything audible.

That choice is deliberate: almost every bug in this project's history was an
integration bug — a wrong basis vector, a CSS stacking context, a message keyed
off the wrong id. Unit tests would have caught none of them.

## Setup

```bash
python3 -m http.server 8777          # serve the repo root
```

Playwright lives at `/home/havban/projects/node_modules`. Software rendering
needs these flags:

```js
chromium.launch({ args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
]})
```

Useful extras: `--autoplay-policy=no-user-gesture-required` for audio tests.

## Hooks

| Hook | Use |
| --- | --- |
| `window.__game` | the whole `Game`: `state`, `rex`, `rhinos`, `world`, `fx`, `mp`, `music`, `chase`, `input`, `cfg` |
| `__game.input.scripted = true` | stop `sample()` clobbering fields you set from a test |
| `__game.cfg` | the live tuning objects — change balance at runtime |
| `window.__stats()` | open the owner stats panel |
| `window.__RR_API` | point the leaderboard/multiplayer client at another backend |
| `window.__rrTrack` | capture analytics events instead of sending them |
| `__game._saveRun()` / `_loadRun()` | write and read the resumable run directly |
| `__game._revives` | how many free revives are left this run |

A typical arrangement: freeze the world, pose the actors, then assert.

```js
await page.evaluate(() => {
  const g = __game;
  g.input.scripted = true;
  g.restTimer = 9999;                       // stop new waves
  g.chase.manual = 9999;                    // stop the camera recentring
  g.rhinos.forEach(r => r.pos.set(120, 0, 120));
  g.rex.pos.set(0, 0, 0); g.rex.yaw = 0; g.chase.yaw = 0;
});
```

## Environment quirks that will mislead you

- **Software rendering runs at ~4–5 fps** and `dt` is clamped to 0.05, so
  **in-game time advances 4–5× slower than wall clock**. Two seconds of
  gameplay needs ~10 s of `waitForTimeout`. Prefer `waitForFunction` on game
  state, or poll `__game.time`.
- **`node --check` passes silently on ES modules.** It parses as CommonJS. A
  duplicated `export const` once took the whole page down and got through.
  Check with a real import:
  ```bash
  node --input-type=module -e "import('file://$PWD/js/config.js').catch(e => console.log(e.message))"
  ```
- `offsetParent` is always `null` for `position: fixed`, so it is useless for
  visibility probes. Use `getBoundingClientRect()` and `getComputedStyle`.
- **`addInitScript` runs on every navigation**, including `reload()`. Putting
  `localStorage.clear()` in there wipes the state you are trying to test on the
  very reload that should prove it persisted. This produced two false
  failures — the visitor tracker and the saved run both looked broken when the
  code was fine. Clear once, after the first load:
  ```js
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  ```
- GoatCounter never counts `localhost`, so tracking cannot be verified locally.
- Pointer lock engages in headless Chromium, which hides the on-screen pause
  button — expected, not a bug.

## Recipes

### Visual

Screenshot and *look*. Do not claim something renders correctly without one.
For model work, park the camera manually:

```js
await page.evaluate(() => {
  __game.state = 'menu'; __game.chase.orbit = () => {};   // stop the camera moving
  __game.camera.position.set(14, 4.5, 0);
  __game.camera.lookAt(0, 3.2, 0);
  document.getElementById('hud').classList.add('hidden');
});
```

### Audio

Render into an `OfflineAudioContext` and measure — this is how the music
levels were balanced and how a broken fade was found:

```js
const ctx = new OfflineAudioContext(1, 44100 * 8, 44100);
const m = new Music(ctx, ctx.destination);
m.style = 'ceria';
m.renderAll(8, 1);
const buf = await ctx.startRendering();
// then compute peak / RMS / clipped-sample count over buf.getChannelData(0)
```

Targets: peak below ~0.97, no samples at 1.0, RMS within a few dB across
styles.

### Direction and geometry

Never eyeball a direction. Project the actual in-game velocity through the
live camera and compare screen-space x — that is how the inverted strafe was
proven:

```js
const vel = new THREE.Vector3(g.rex.vel.x, 0, g.rex.vel.z).normalize();
const P = new THREE.Vector3(g.rex.pos.x, 2.5, g.rex.pos.z);
const sx = v => v.clone().project(g.camera).x;
const screenDx = sx(P.clone().add(vel.multiplyScalar(6))) - sx(P);   // > 0 means right
```

### Responsive layout

Loop over viewports, then assert that elements do not overlap and none sits
off-screen:

```
390×844 phone portrait · 844×390 phone landscape · 820×1180 tablet
1180×820 tablet landscape · 1440×900 laptop
```

Check `document.body.className` for `is-touch` / `is-portrait` / `is-short`,
and compare bounding boxes of `#stick`, `.tbtns`, `.panel-left`,
`.panel-right`, `#btn-pause`.

### Multiplayer

Open two pages in the **same** browser context, host on one, join on the
other, and assert on both ends. WebRTC connects over loopback in about a
second, no STUN needed.

```js
const A = await ctx.newPage(), B = await ctx.newPage();
// A: click #btn-coop, #btn-host, read #lobby-mycode
// B: click #btn-coop, fill #lobby-code, click #btn-join
// then assert __game.mp.players.size and __game.rhinos.length on both
```

Instrument the session to prove a claim really travelled:

```js
await B.evaluate(() => { const s = __game.mp, o = s.claimHit.bind(s);
  window.__sent = []; s.claimHit = (r, d, k, kn) => { __sent.push({ id: r.netId, d }); return o(r, d, k, kn); }; });
```

### Worker

The Worker is plain JavaScript, so it runs in Node with D1 shimmed over
`node:sqlite` — real SQL, real validation, no Cloudflare account:

```js
const { DatabaseSync } = require('node:sqlite');      // node --experimental-sqlite
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('worker/schema.sql', 'utf8'));

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async first() { const r = db.prepare(this.sql).get(...this.args); return r === undefined ? null : r; }
  async run() { db.prepare(this.sql).run(...this.args); return { success: true }; }
}
const env = { DB: { prepare: (sql) => new Stmt(sql) }, RUN_SECRET: 'test', ALLOW_ORIGIN: '*' };
const worker = (await import('./worker/src/index.js')).default;
await worker.fetch(new Request('http://x/scores'), env);
```

Wrap that in an `http.createServer` and the browser can point at it with
`window.__RR_API`, which is how the full client-to-Worker round trip was
verified before anything touched production.

## Before shipping

1. Every module imports cleanly (the `--input-type=module` check above).
2. Solo run: menu → play → pause → die → restart, no console errors.
3. Screenshot anything visual that changed.
4. Responsive sweep if UI changed.
5. Two-page co-op run if netcode changed.
6. `renderer.info` sanity: draw calls and triangles have not jumped.
7. If you changed the wave curve or scoring, update `spawnedThrough()` and
   `maxScore()` in `worker/src/index.js` to match, and redeploy the Worker.
8. Push, wait for the Actions run, then verify against the **live URL** —
   remembering the 10-minute Pages cache (`?v=2` bypasses it).
