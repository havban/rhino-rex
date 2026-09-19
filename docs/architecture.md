# Architecture

## Shape of the thing

```
index.html ─ import map ─→ js/main.js ─→ everything else
                               │
     ┌─────────────────────────┼──────────────────────────┐
     │                         │                          │
  simulation                rendering                  services
  rex, rhino, fireball      world, geom, fx            net, multiplayer
  world (collision)         camera                     leaderboard, scores
  config (tuning)           music, audio               analytics
```

There is no framework and no state container. `Game` in `js/main.js` owns
everything and passes what each system needs into its `update(dt)`.

## The frame

`Game._loop()` runs on `requestAnimationFrame`:

1. `dt = min(clock.getDelta(), 0.05)` — the clamp keeps a stalled tab from
   teleporting everything, and is why in-game time runs slower than wall clock
   under software rendering.
2. `_adaptResolution(dt)` — drops the device pixel ratio if frame time slips,
   raises it again when there is headroom.
3. `_update(dt)`:
   - world (scenery destruction, respawns, clouds), FX, pickups
   - input sample, camera look
   - fire breath, buffered attacks, `rex.update()` → returns a hit event
   - enemy updates (or replicated poses when a co-op guest)
   - co-op session traffic and respawns
   - wave flow (host/solo only)
   - camera follow, HUD
4. `renderer.render(scene, camera)`

`state` is one of `menu`, `playing`, `paused`, `dead` and gates most of the
above.

## Rendering

Three.js r160, vendored as a single ES module. One `WebGLRenderer` with a
single directional light plus hemisphere and ambient fill, ACES tone mapping
and PCF soft shadows. The shadow frustum follows the player (`world.followSun`)
so it stays sharp over a 300-unit arena.

Typical scene at wave 12: **~400 draw calls, ~190k triangles**. Grass and
flowers are `InstancedMesh`; particles are a single `Points` with a custom
shader; damage numbers are DOM elements projected to screen space.

Quality is chosen from screen size, overridable in the menu, and the pixel
ratio adapts at runtime:

| Preset | Antialias | Shadows | Grass | Pixel ratio cap |
| --- | --- | --- | --- | --- |
| low | off | off | 900 | 1 |
| medium | on | on (1024) | 2200 | 1.5 |
| high | on | on (2048) | 4200 | 2 (1.5 on touch) |

## Procedural geometry

`js/geom.js` is the reason the creatures look smooth without any modelling
tools:

- `makeProfile(points)` — a Catmull-Rom curve through `{ z, v }` control
  points, used as a radius or offset profile.
- `tubeAlongZ(opts)` — sweeps an elliptical cross-section along Z with varying
  radius, squash and centre offset, closes both ends, computes normals, and can
  emit skinning attributes. Bodies, necks, tails, skulls and jaws are all this
  one function with different profiles.
- `ellipsoid`, `capsule`, `cone`, `skinMaterial` — smooth-shaded primitives.

The T-Rex body is a single `SkinnedMesh` over an 11-bone chain (hips → spine →
chest → neck ×2 → head, plus five tail bones), so the neck and tail bend
smoothly. Its bind pose is straight along Z; the `POSE` constants bend it into
a tyrannosaur on every frame. Everything else (legs, arms, head parts) is
rigid meshes parented to bones or groups.

Rhinos are simpler: a rigid swept barrel with a separate head group that
pivots, and capsule legs.

## Audio

Two independent graphs under one `AudioContext`:

- `js/audio.js` — one-shot effects synthesised per call (oscillators, filtered
  noise bursts, pitch-dropping sine kicks).
- `js/music.js` — a 16th-note look-ahead scheduler feeding four layer gains
  (`base`, `perc`, `lead`, `boss`) that fade in with an `intensity` value the
  game sets from its state. Four styles share the scheduler and voice bank.
  Output passes through a compressor and a tanh soft clipper, then a per-style
  trim, because the raw mix has a ~20 dB crest factor.

Music sits on its own bus under the master gain, so the sound toggle silences
everything while the music picker only affects music.

## Input

`js/input.js` normalises keyboard, mouse (pointer lock *and* drag fallback) and
touch into one state object: `move {x, y}`, `look {dx, dy}`, plus `sprint`,
`jump`, `bite`, `tail`, `fire`, `fireball`.

Keyboard and touch are live **simultaneously** — a laptop with a touchscreen
keeps both. Which on-screen controls show is driven by the last input device
used, with two safeguards: events from form fields are ignored entirely, and a
touch anywhere restores touch mode even when the pad is hidden.

`input.scripted = true` makes `sample()` a no-op so tests can drive the fields
directly.

## Update notification

There is no service worker. The deploy workflow stamps the commit into
`<meta name="build">` and writes the same value to `version.json`.
[`js/update.js`](../js/update.js) compares the two, polling every five minutes
and whenever the tab regains focus, and shows a reload toast when they differ.

Reloading navigates to `?v=<build>` rather than calling `location.reload()`,
because GitHub Pages serves `max-age=600` and a plain reload can return the
very JavaScript being replaced. A manual **🔄 Muat ulang halaman** button sits
on the pause card for the same reason.

Locally the meta still holds `__BUILD__`, which the module treats as "not a
real build" and stays silent.

## Persistence

Everything is `localStorage`, all keys prefixed `rr.`:

| Key | Contents |
| --- | --- |
| `rr.quality` | graphics preset |
| `rr.sound`, `rr.music` | audio settings |
| `rr.best` | best score (legacy, still shown) |
| `rr.scores` | local top-10 leaderboard |
| `rr.name` | last name entered |
| `rr.stats` | lifetime play stats for the owner panel |
| `rr.visit` | first seen / last seen / active days |
