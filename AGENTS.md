# AGENTS.md

Working notes for anyone (human or agent) picking this repo up. Read this
before changing anything; the conventions here are load-bearing and several of
the gotchas cost real debugging time to find.

Full documentation lives in [`docs/`](docs/). Start with
[`docs/README.md`](docs/README.md).

---

## What this is

**Rhino Rex** — a third-person 3D browser game. You are a T-Rex defending a
sunny grassland against waves of charging rhinos. Live at
<https://havban.github.io/rhino-rex/>, deployed from `main` by GitHub Actions.

It is a **static site with no build step**. Open `index.html` through any web
server and it runs. A small Cloudflare Worker backs the global leaderboard and
brokers the multiplayer handshake, but the game works fully without it.

## Hard rules

1. **No build step.** Plain ES modules loaded by an import map in
   `index.html`. No bundler, no transpiler, no `npm` dependency for the game
   itself. (`worker/` has a `package.json`, but only for `wrangler`.)
2. **No external assets.** Every model, texture, sound and music track is
   generated in code. Three.js is vendored at `vendor/three.module.js` (r160).
   If you are about to add a `.glb`, `.png` or `.mp3`, stop and generate it
   instead — this rule is why the whole game is ~200 KB excluding Three.
3. **Nothing may hard-depend on the backend.** Leaderboard, multiplayer and
   analytics all fail soft. If `js/leaderboard.js`'s `API` is empty or the
   Worker is down, the game still plays and says so in the UI.
4. **Language split.** Player-facing strings are **Indonesian**. Code
   comments, commit bodies below the summary line, and `docs/` are **English**.
   `README.md` and `worker/README.md` are Indonesian because they address the
   owner/player.
5. **Comments explain *why*.** The code is readable enough to say what it does.
   Comment the reasoning, the constraint, or the bug being avoided.

## Layout

```
index.html            HUD, menus, import map, GoatCounter tag
css/style.css         all styling, including responsive breakpoints
js/main.js            game loop, waves, combat resolution, UI wiring  (largest file)
js/config.js          every tuning number lives here — start here to rebalance
js/rex.js             player: skinned T-Rex model, animation, attacks
js/rhino.js           enemy: model, charge AI, replicated mode
js/world.js           arena, sky, destructible trees/rocks, collision
js/geom.js            smooth-surface builders (swept tubes, ellipsoids, capsules)
js/fx.js              particles, damage numbers, camera shake
js/camera.js          third-person chase camera with auto-recentre
js/input.js           keyboard + mouse + touch, normalised
js/audio.js           procedural sound effects
js/music.js           procedural music, 4 styles, adaptive layers
js/fireball.js        the lobbed projectile
js/scores.js          local leaderboard (localStorage)
js/leaderboard.js     global leaderboard client (fails soft)
js/net.js             WebRTC connection + data channels
js/multiplayer.js     co-op session: replication and damage claims
js/analytics.js       local stats panel + GoatCounter events
worker/               Cloudflare Worker + D1 schema (leaderboard + signalling)
docs/                 documentation
```

## Running and testing

```bash
python3 -m http.server 8777          # from the repo root, then open localhost:8777
```

Browser automation (Playwright lives at `/home/havban/projects/node_modules`):

```js
chromium.launch({ args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
]})
```

**`window.__game` is the test hook.** It exposes `state`, `rex`, `rhinos`,
`world`, `fx`, `mp`, `music`, `chase`, `input` and `cfg` (the live tuning
objects). Set `__game.input.scripted = true` to drive input from a test without
`sample()` overwriting it.

Other hooks: `window.__stats()` opens the owner stats panel, `window.__RR_API`
overrides the backend URL, `window.__rrTrack` replaces the analytics sink.

### Environment quirks that will mislead you

- **Software rendering runs at ~4–5 fps** and the loop clamps `dt` to 0.05, so
  **in-game time advances 4–5× slower than wall clock**. A 2-second gameplay
  event needs ~10 s of `waitForTimeout`. Prefer waiting on state
  (`waitForFunction`) or on `__game.time`.
- **`node --check` silently passes on ES modules.** It parses as CommonJS and
  reports nothing useful. A duplicated `export const` once broke the entire
  page and got through. Check syntax with a real import instead:
  ```bash
  node --input-type=module -e "import('file://$PWD/js/config.js').catch(e => console.log(e.message))"
  ```
- Verify visual changes with screenshots, and verify audio by rendering into an
  `OfflineAudioContext` and measuring peak/RMS. Do not claim something looks or
  sounds right without one of those.

## Deploying

**Game** — push to `main`; `.github/workflows/deploy.yml` publishes to Pages.
GitHub serves `cache-control: max-age=600`, so a phone can hold stale JS for
ten minutes. Use `?v=2` on the URL to bypass it when testing a fresh deploy.

**Worker** — needs a Cloudflare API token:

```bash
cd worker
CLOUDFLARE_API_TOKEN=$(cat ~/.cf-token) npx wrangler deploy
CLOUDFLARE_API_TOKEN=$(cat ~/.cf-token) npx wrangler d1 execute rhino-rex --remote --file=./schema.sql
```

`wrangler login` **cannot work** from a non-interactive shell: it detects
`isInteractive: false` and aborts after ~7 seconds without waiting for the
browser callback. Use a token. Never commit it; `~/.cf-token` (mode 600) is the
convention here.

## Gotchas found the hard way

Each of these was a real bug. Re-introducing them is easy.

| Area | Trap |
| --- | --- |
| Camera basis | Screen-right for a camera facing `(sin y, 0, cos y)` is `(-cos y, 0, sin y)`. The intuitive `(cos y, 0, -sin y)` is **left**, and inverted the strafe controls. |
| Camera recentre | Movement is camera-relative, so auto-recentring onto the player's facing spins forever while strafing. Only recentre when input is forward-ish or absent. |
| `AudioParam` | `exponentialRampToValueAtTime` from `0.0001` is inaudible for most of its duration and never converges when re-triggered. Use `setTargetAtTime` for mix levels. |
| Instanced colour | `vertexColors: true` on a geometry without a `color` attribute renders **black**. For `InstancedMesh`, leave `vertexColors` off and let `instanceColor` drive it. |
| Stacking | `position: fixed` creates a stacking context, so `#hud`'s children could not outrank the touch layer. Two `.screen` overlays at the same `z-index` stack by DOM order. |
| Pointer lock | While locked, the canvas swallows clicks — HUD buttons are unreachable, which is why the pause button hides in that state. |
| Input mode | Any `keydown` used to switch off touch controls, so typing a leaderboard name removed the joystick with no way back. Ignore events from form fields; only game keys switch mode. |
| Multiplayer | Guests must not run wave logic; snapshots carry the host's `restTimer` and will otherwise wake a second, local wave. Always key players by message id, never by connection. |
| Particles | Emission must be per-second (`rate * dt`), not per-frame, or the effect changes with frame rate. |
| GoatCounter | It never counts `localhost`, so local testing cannot dirty the dashboard — and cannot verify tracking either. |

## Tuning

`js/config.js` holds every gameplay number: `REX`, `ATTACK`, `FIREBALL`,
`RHINO`, `WAVES`, `SCENERY`, `CAMERA`, `IMPACT`, `WORLD`, `COLORS`. Change
balance there, not in the systems. `__game.cfg` points at the same objects, so
you can tune live in the console before committing a value.
