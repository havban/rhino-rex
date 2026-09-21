# Architecture

## Shape of the thing

```
index.html ─ import map ─→ js/main.js ─→ everything else
                               │
     ┌─────────────────────────┼──────────────────────────┐
     │                         │                          │
  simulation                rendering                  services
  rex, creatures            world (arenas), geom, fx   net, multiplayer
  rhino, wildlife           camera                     leaderboard, scores
  fireball, mine            music, audio               analytics
  world (collision)
  config (tuning + content)
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
   - world (scenery destruction, respawns, clouds, motes), FX, pickups
   - wildlife — runs in the menu too, but only allowed to bite while playing
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

Each rhino's health bar is a **single quad with a fragment shader** that draws
the frame, quarter ticks, the pale "damage just taken" trail and the fill —
cheaper than the two plain planes it replaced, and legible at range. It is
billboarded and counter-scaled against both the variant's size and the camera
distance, so a calf's bar is not a speck and a Matriarch's is not a hoarding.
A Matriarch additionally gets a DOM boss bar in the HUD.

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

## The player model

`js/rex.js` owns the 11-bone skeleton, the animator, and the theropod body —
one skinned surface swept over the bones. `FORMS` picks which creature hangs
off that skeleton:

- `creature: 'theropod'` → `Rex._buildTheropod()`, dialled by girth, tail
  length, head and arm scale, and an optional pair of wings.
- `creature: 'kaiju'` → `buildKaiju()` in `js/creatures.js`.
- `creature: 'ape'` → `buildApe()` in `js/creatures.js`.

The skeleton is the contract. Each builder must leave behind `rex.mesh`,
`rex.head`, `rex.jaw`, `rex.mouthAnchor`, `rex.legs` and `rex.arms`, and then
the one animator walks, bites and spins all of them. `FORMS` also carries
stance — `hipScale`, `scale`, `pose` and `leg` overrides — because the legs
hang off the torso, so a big torso tilt has to be answered at the hip or the
feet swing out from under the creature.

`SKINS` is orthogonal: body, belly, stripe, plate, wing and eye colours. The
three body colours are baked into the vertex colours during the sweep and the
tail length changes the skeleton, so both setters rebuild the model — cheap,
and only ever triggered from the menu.

`SKINS` cannot affect the fight at all, and neither can `FORMS` except for one
deliberate entry: `flight`, which only Rex Bersayap has. Reach, damage and the
collision radius still come from `ATTACK`/`REX`, never from the model — and
since every melee and breath check now folds the player's altitude into its
range, a flyer gains height rather than free hits.

## Animating on a wobbling frame rate

One rule, learned the hard way, applies to every cycle in the game: **integrate
a phase at the current rate, never multiply an accumulated phase by a rate that
can change.**

```js
this.gait += dt * (4 + speed * 0.5);   // right
Math.sin(this.phase * (4 + speed * 0.5));  // wrong
```

The second form looks equivalent but is not: `phase` grows all run, so a small
wobble in `speed` moves the sine's argument by `phase × Δrate` — tens of
radians after a minute of play. That is what made the birds and the walk
cycles stutter. Rates that switch outright (a bird getting angry, a wing
opening on take-off) are eased toward their new value rather than snapped, for
the same reason.

Two more rules fall out of the same problem:

- **Amplitudes follow a smoothed speed** (`animSpeed`), not the raw one. The
  raw speed twitches every frame as steering and `world.resolve` push the body
  about, and a twitching amplitude looks exactly like a twitching animal.
- **No `Math.abs(sin)` for a two-per-stride bounce.** Its derivative flips
  sign at every footfall, and that kink travels up the body and reads as a
  shake. `0.5 - 0.5 * cos(2 × gait)` gives the same rhythm and is smooth
  everywhere.

A walking animal's head is then *stabilised* against the body: about 72 % of
the bounce is cancelled in the head's local position, which is what real birds
do and what stops the head jittering. Head swing ends up at 0.06 units while
the body swings 0.22.

**Steering gets the same treatment.** A raw wish direction flips about — a
wander target is reached, a threat moves, `world.resolve` shoves the body off
course — and each flip used to reach the yaw as a snap of up to 0.42 rad in a
single frame. Three rules now stand between the wish and the facing:

1. the wish feeds a **filtered `heading`** rather than the yaw directly;
2. the yaw change is clamped to a per-species **turn rate** (`WILDLIFE.kinds[k].turn`,
   radians per second) so nothing can pivot in one frame;
3. an animal whose actual movement falls below 30 % of what it is attempting
   for 0.8 s is **stuck** — grinding into a tree — and picks somewhere else to
   go instead of shuddering against it.

Frequencies matter too: a 1.75 Hz full-amplitude wingbeat reads as a buzz
rather than a flap. Birds beat at ~1.1 Hz with a skewed waveform
(`sin(w + 0.38·sin w)` — quick downstroke, slower recovery) and their bodies
rise on the downstroke rather than bobbing at walking-gait pace, which a
flying animal has no business doing.

## Wildlife

`js/wildlife.js` holds a fixed pool of `Critter`s managed by one `Wildlife`
instance — fifteen on the high preset, scaled down to twelve and nine on
medium and low, because a phone draws them too. Each species is a procedural
model (`chicken`, `dodo`, `bird`, `tortoise`, `boar`, `monitor`) that returns
the parts the animator touches — head, wings, legs — with everything else
parented to the group. The pool is seeded with each species' `min` before the
weighted roll fills the rest, so no run comes up with an empty sky.

`Wildlife.update()` returns the damage the animals did to the player this
frame, so `Game` can play the hurt feedback once. It runs in the menu too, and
is passed `canHarm: false` there, which keeps the arena alive behind the card
without the ability to hurt anyone. A dead critter counts its respawn timer
down inside the same loop and places itself somewhere new.

Damage flows the other way through `Game._hitCritter()`, which every weapon
path calls: `coneHit` (bite and tail), `fireTick` (breath) and `_explode`
(fireball, dynamite, mines). None of them touch score, kills, combo or drops.

## Arenas

`js/world.js` builds the whole arena from one entry in `ARENAS`
(`js/config.js`) — sky gradient, fog, three lights, ground texture, grass,
motes, pools, trees, boulders, clouds, hills and the edge ring. Nothing about
the place is hard-coded in the builder, so a new arena is a palette plus a few
style switches.

Everything the arena owns is parented to a single `World.root` group.
`World.dispose()` walks it, frees every geometry and material once, and
unhooks the group, which is what makes `Game.setArena()` able to swap arenas
mid-run without a reload. Repeated parts (mangrove stilt roots, charred
branches) share one geometry and vary by instance scale.

See [gameplay.md](gameplay.md) for the three arenas and why they are cosmetic
only.

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

Leaving the page stops the audio outright rather than turning it down.
`visibilitychange`, `pagehide` and the sound toggle all route through
`Game._silence()` / `Game._wake()`: `_silence()` stops the music scheduler,
kills the flame loop and **suspends** the `AudioContext`, so a backgrounded or
closed tab makes no sound and schedules nothing. `_wake()` resumes the context
and restarts the music, which was stopped rather than ducked. Pausing inside
the game still only ducks the music to 0.28.

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

## Saved runs

`Game._saveRun()` writes the *shape* of a run — wave, score, kills, health,
fire, weapon tallies and the remaining revive — every five seconds, on each
cleared wave, on pause, and on `pagehide`. It never stores the world.

Resuming calls `start(saved)`, which sets `wave = saved.wave - 1` so the normal
wave flow spawns that wave fresh. The deliberate consequence: you lose at most
part of one wave, the save stays a few hundred bytes, and there is no risk of
restoring a broken mid-charge world. Saves expire after 24 hours and are only
offered from wave 2. Co-op runs are never saved — the host owns that state.

One subtlety: a resumed run starts a **new** leaderboard token, and `seconds`
is measured from the resume. Carrying the original elapsed time would exceed
the new token's age and the Worker would reject the submission.

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
| `rr.arena` | which arena to build |
| `rr.form` | which hunter to play |
| `rr.skin` | its colours (defaults to the form's own on a first pick) |
| `rr.run` | the saved run offered as **▶ LANJUTKAN** |
