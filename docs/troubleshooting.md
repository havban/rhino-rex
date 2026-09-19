# Troubleshooting

Symptoms actually hit in this project, with what turned out to be causing them.

## Game

**The page is blank and the console says `Unexpected token 'const'` (or similar).**
A syntax error in a module. `node --check` does not catch these in ES modules —
it parses as CommonJS. Check every file with a real import:
```bash
for f in js/*.js; do node --input-type=module -e "import('file://$PWD/$f').catch(e => console.log('$f', e.message))"; done
```

**Movement goes the wrong way when strafing.**
The camera-right basis vector. For a camera facing `(sin y, 0, cos y)`,
screen-right is `up × forward = (-cos y, 0, sin y)`. The intuitive
`(cos y, 0, -sin y)` points *left*. Prove it by projecting velocity to screen
space rather than eyeballing it.

**The camera spins forever on its own.**
Auto-recentring onto the player's facing while movement is camera-relative:
strafing turns the dinosaur, the camera follows, "sideways" rotates again.
Only recentre when input is forward-ish or absent.

**Touch controls vanish and the desktop ability row appears.**
Something switched the input mode to keyboard — historically any `keydown`,
including typing a name into the leaderboard field. Events from form fields
are now ignored and only game keys switch mode; a touch anywhere restores
touch mode, which matters because the pad is `display: none` when off and can
never receive the touch that would restore it.

**A HUD button does nothing on desktop.**
Pointer lock. While locked, the canvas receives all mouse events. That is why
the pause button hides in that state.

**An overlay opens behind another overlay.**
Both `.screen` elements share `z-index: 20`, so DOM order decides. Also
remember `position: fixed` creates a stacking context — `#hud` needed its own
`z-index` before a button inside it could outrank the touch layer.

**Instanced meshes render black.**
`vertexColors: true` on a geometry with no `color` attribute yields black. For
`InstancedMesh`, leave `vertexColors` off and let `instanceColor` drive it.

**A particle effect looks different at different frame rates.**
Emission is per-frame instead of per-second. Spawn `rate * dt` particles, and
offset each one's position and age by a random fraction of `dt` so bursts do
not clump at low frame rates.

**A gain/fade never reaches its target.**
`exponentialRampToValueAtTime` starting from `0.0001` spends nearly its whole
duration inaudible, and re-triggering it every frame means it never converges.
Use `setTargetAtTime` for mix levels, or a linear ramp for a fade-in.

**Music is quiet, and turning it up clips.**
The mix has a ~20 dB crest factor. Raising the gain alone drives peaks past
1.0. Compress first, then make up the level, then soft-clip — and pick the
makeup value from a measured sweep.

**A projectile flies over everything nearby.**
The T-Rex's mouth is ~5.5 units up. A straight shot from there passes above a
3-unit rhino. Solve the arc to a target point instead of picking a direction,
and test damage cones flat (horizontally) rather than in true 3D.

## Multiplayer

**A guest sees twice as many rhinos as the host.**
The guest ran its own wave logic. Snapshots carry the host's `restTimer`, which
wakes the guest's wave flow. Wave spawning must be host-only.

**A player appears twice.**
Poses keyed by connection, snapshots keyed by player id. Every message must
carry its origin id (`i`), and guests must not create an avatar on connect —
they wait for the first pose, which is where the host's real id arrives.

**Damage claims do nothing.**
The replicated rhino had no `netId`. Guests must copy the network id onto the
entity when they create it from a snapshot.

**Two players cannot connect at all.**
No TURN server, so strict NATs fail. Nothing to do short of adding TURN. Check
`pc.connectionState` on both ends before assuming a bug in the game.

**The ▶ LANJUTKAN button never appears.**
A save is only offered if it reached wave 2, is under 24 hours old, and the run
was solo. Check `localStorage.getItem('rr.run')`. In tests, see the
`addInitScript` trap in [testing.md](testing.md) — clearing storage on every
navigation deletes the save before the reload that was meant to read it.

**The revive prompt does not show.**
It is offered once per run and only from wave 2. `__game._revives` holds what
is left.

**An overlay marker behaves oddly for one enemy but not another.**
Check whether the material is shared. `MARKER_GEO` is shared on purpose, but
materials are cloned per rhino precisely because each fades on its own
distance — mutating a shared material makes every marker follow whichever
entity updated last.

**Touch pads overlap the HUD panels on a phone.**
Landscape phones lose 60–90 px to the browser bars, which is enough to push a
four-row pad stack into the score panel. Short screens use a three-wide, two-
deep grid for that reason. Re-measure with the overlap harness rather than
eyeballing one device.

## Backend

**Every request returns 403 `origin ditolak`.**
`ALLOW_ORIGIN` does not list the calling origin. It is a comma-separated
allow-list and currently contains the Pages site and `http://localhost:8777`.

**Submissions return 429.**
Six per hour per IP. Local curl testing burns the quota for the browser too,
since both hash to the same address.

**A legitimate submission is rejected as implausible.**
The validator mirrors the spawn and scoring formulas in `js/config.js`. If you
rebalance the game, update `spawnedThrough()` and `maxScore()` in the Worker to
match, or real scores start bouncing.

This has already happened once in the other direction: softening the early
waves changed `WAVES.count()` while the Worker kept the old formula, so it
believed wave 12 could spawn 145 rhinos when the game only spawns 106 — no
false rejections, but a 37 % window for forged kill counts. Silent failures
like that are why the check is worth re-deriving whenever balance moves.

**`wrangler login` hangs or fails immediately.**
It cannot work in a non-interactive shell: it logs `isInteractive: false` and
exits after ~7 seconds without waiting for the browser. Its callback server
also binds `[::1]` only, so another device on the LAN cannot reach it. Use a
scoped API token.

## Deployment

**A fix is deployed but the phone still shows the old behaviour.**
GitHub Pages sends `cache-control: max-age=600`. Load `?v=2`, or wait ten
minutes. Confirm what is actually live by fetching the file:
```bash
curl -s https://havban.github.io/rhino-rex/js/input.js | grep typingInto
```
