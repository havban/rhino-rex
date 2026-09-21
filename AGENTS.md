# AGENTS.md

Working notes for anyone (human or agent) picking this repo up. Read this
before changing anything; the conventions here are load-bearing and several of
the gotchas cost real debugging time to find.

Full documentation lives in [`docs/`](docs/). Start with
[`docs/README.md`](docs/README.md).

---

## What this is

**Rhino Rex** — a third-person 3D browser game. You are a T-Rex (or a winged
one, a kaiju, or a giant ape) defending one of three arenas against waves of
charging rhinos, with a population of harmless-until-provoked wildlife
underfoot. Live at <https://havban.github.io/rhino-rex/>, deployed from `main`
by GitHub Actions.

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
6. **Content choices stay cosmetic.** Arenas (`ARENAS`), skins (`SKINS`) and
   hunter forms (`FORMS`) must not change reach, damage, speed or the
   collision radius, or leaderboard entries stop being comparable. There is
   exactly **one** deliberate exception, `FORMS.bersayap.flight`, and it is
   paid for by the altitude rule below. If you add a second, say so loudly.

   Re-measure it after any change to `js/rex.js` or `js/creatures.js`: every
   form must bite for 26 and tail for 21.

## Licence

AGPL-3.0 (see `LICENSE`). Contributions are taken under the same licence. The
vendored Three.js stays MIT with its header intact — keep it, and keep
`THIRD-PARTY.md` current if anything else ever gets vendored.

Section 13 matters here because the game is played over a network: anyone
using a modified version must be offered its Corresponding Source. That is
satisfied by the **"Kode sumber versi ini"** link on the menu, which
`Update.stampSourceLink()` points at the exact deployed commit. If you fork
and host this, repoint that link at your own repository — and do not remove
it.

## Layout

```
index.html            HUD, menus, import map, GoatCounter tag
css/style.css         all styling, including responsive breakpoints
js/main.js            game loop, waves, combat resolution, UI wiring  (largest file)
js/config.js          every tuning number lives here — start here to rebalance
js/rex.js             player: skeleton, animator, theropod body, attacks
js/creatures.js       the non-dinosaur hunters: kaiju and ape bodies on the same skeleton
js/rhino.js           enemy: model, charge AI, replicated mode
js/world.js           arena (3 themes from ARENAS), sky, destructible trees/rocks, collision
js/wildlife.js        background animals: wander, flee, retaliate, respawn — no score
js/geom.js            smooth-surface builders (swept tubes, ellipsoids, capsules)
js/fx.js              particles, damage numbers, camera shake
js/camera.js          third-person chase camera with auto-recentre
js/input.js           keyboard + mouse + touch, normalised
js/audio.js           procedural sound effects
js/music.js           procedural music, 4 styles, adaptive layers
js/fireball.js        the lobbed projectile (fireball and thrown dynamite)
js/mine.js            the placed mine: arms, blinks, triggers on proximity
js/scores.js          local leaderboard (localStorage)
js/leaderboard.js     global leaderboard client (fails soft)
js/net.js             WebRTC connection + data channels
js/multiplayer.js     co-op session: replication and damage claims
js/analytics.js       local stats panel + GoatCounter events
js/update.js          notices a new deploy and offers a reload
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
`wildlife`, `world`, `fx`, `mp`, `music`, `chase`, `input` and `cfg` (the live
tuning objects). Set `__game.input.scripted = true` to drive input from a test without
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
The workflow stamps the commit into `<meta name="build">`, writes
`version.json`, and appends `?v=<commit>` to the stylesheet, the entry module,
the Three.js import-map entry and every relative import between modules.
That last part matters: Pages caches each file for ten minutes independently,
so without versioned URLs a reload can mix new HTML with an old stylesheet.
A browser still needs one fresh HTML fetch after a deploy — `?v=2` on the URL
forces it.

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
| Balance vs backend | The Worker's anti-cheat re-implements the spawn and scoring formulas. Change `WAVES.count()` or the score maths and you must update `spawnedThrough()` / `maxScore()` in `worker/src/index.js` and redeploy, or the check silently loosens. |
| Cyclic animation | Never `sin(accumulatedPhase * rate)` when `rate` can change — `phase` grows all run, so a speed twitch shifts the argument by `phase × Δrate`. Integrate instead: `gait += dt * rate`. This made every walk cycle and wingbeat stutter. |
| Bounce shape | `Math.abs(sin)` for a two-per-stride hop has a sign-flipping derivative at every footfall. The kink travels up the body and reads as a head shake. Use `0.5 - 0.5·cos(2·gait)`. |
| Animation amplitude | Scale amplitudes by a smoothed speed, not the raw one: steering and `world.resolve` make raw speed twitch every frame. |
| Altitude and reach | Range checks must fold in the player's height — **both ways**. Player attacks did it first and a flying player still got gored, because the rhino's tests were flat distance. |
| Single-sided meshes | A hand-built membrane with `computeVertexNormals` is invisible from its back face. A wing is seen from both sides; use `side: THREE.DoubleSide`. |
| Pose vs legs | Legs hang off the torso group, so changing `pose.body` swings the feet out from under the creature. Answer a torso tilt with `leg.hip`, then measure the lowest rigid point — do not eyeball it. |
| Skinned bounding boxes | `geometry.boundingBox` on a `SkinnedMesh` is the **bind pose**, so a footprint measured that way is nonsense for anything with a long tail. Exclude skinned meshes and measure the rigid parts. |
| Spawn clearing | The chase boom sits ~20 units behind the player, so `SCENERY.spawnClearing` has to be wider than that or a run can start with a tree in the camera. |
| Playwright | `addInitScript` runs on **every** navigation. `localStorage.clear()` in there wipes the state a reload was supposed to prove persisted — it faked two bug reports already. |
| GoatCounter | It never counts `localhost`, so local testing cannot dirty the dashboard — and cannot verify tracking either. |

## Tuning

`js/config.js` holds every gameplay number. Change balance there, not in the
systems. `__game.cfg` points at the same objects, so you can tune live in the
console before committing a value.

**Balance:** `REX`, `ATTACK`, `FIREBALL`, `RHINO`, `WAVES`, `SCENERY`,
`ITEMS`, `PROGRESS`, `IMPACT`, `WORLD`, `CAMERA`. Difficulty lives in `WAVES`
(`count`, `damageScale`, `dropChance`); revives and saved runs in `PROGRESS`;
the weapon drops and their Mario-Kart-style repeat weighting in `ITEMS`.

**Content:** four tables that add things rather than tune them.

| Table | Adds | Read by |
| --- | --- | --- |
| `ARENAS` | a place to fight: palette, fog, lights, ground texture, tree/fence/mote/pool styles | `js/world.js` |
| `FORMS` | a hunter: which creature builder, girth/tail/head/arm dials, stance (`pose`, `leg`, `hipScale`, `scale`), wings, flight | `js/rex.js`, `js/creatures.js` |
| `SKINS` | a colour set: body, belly, stripe, plate, wing, face, eye, pupil | both of the above |
| `WILDLIFE` | a species: health, speed, bite, flee/rush behaviour, population caps and minimums | `js/wildlife.js` |

Adding to any of them should be a new entry, not new code. If you find
yourself editing a builder to add an arena or an animal, the table is missing
a knob — add the knob.
