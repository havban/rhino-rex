# Gameplay

Numbers below come from [`js/config.js`](../js/config.js) and are the source of
truth for balance. Change them there, never in the systems.

## The player

A T-Rex with 100 HP, 100 fire meter, walking at 13 u/s and sprinting at 21 u/s.
Health regenerates at 3.5/s but only after 5 seconds without being hit; the
fire meter refills at 15/s continuously.

### Weapons

| Weapon | Key | Damage | Reach | Cooldown | Notes |
| --- | --- | --- | --- | --- | --- |
| 🦷 Bite | LMB / `J` | 26 | 7.2, 54° cone | 0.62 s | Fastest; best single-target DPS |
| 🔥 Fire breath | RMB / `F` | 42/s | 22, 34° cone | — | Drains 27/s; sets a 3.2 s burn at 11/s; ignites trees |
| 🌀 Tail spin | MMB / `K` | 21 | 10.2, **360°** | 1.5 s | Turns onto the nearest target, spins a full turn, knocks back 26 and stuns 1.1 s |
| ☄️ Fireball | `R` / `E` | 58 direct + 34 splash | ~14–58 lobbed | **4.0 s** | Costs 40 fire; 7-unit blast with falloff, burn and knockback |

Two details that matter:

- **The fire cone is tested flat.** The T-Rex's mouth is ~5.5 units up, so a
  true 3D cone sails over anything standing close. Damage uses a horizontal
  cone from the body; only the visuals come from the mouth.
- **The tail spin is a visual yaw offset**, not a change to the player's
  facing. The camera and aim never rotate with it, so a 360° attack does not
  spin the screen.

The cannon's long cooldown is deliberate: at 3 s it was simply the best button
to press, so it is now a decision rather than part of a rotation.

Attack presses are buffered for 0.28 s, so a press during another animation
fires as soon as it can rather than being dropped.

## Items

Rhinos drop the occasional crate (16 % per kill, always from a Matriarch). You
carry **one item at a time** and fire it with `Q`, or the extra pad that
appears on touch only while you are holding something.

| Item | Charges | What it does |
| --- | --- | --- |
| 🧨 **Dinamit** | 3 | Lobbed like the cannon but on a 1.15 s fuse — it goes off in the air or where it lands. 95 damage over a 10.5-unit blast, no burn. |
| 💣 **Ranjau** | 2 | Planted behind you, arms after 0.8 s, then waits up to 30 s. 130 damage over 9 units plus a 2 s stun when something comes within 3.4 units. |

The mine is the answer to a charging rhino: a charge commits to a straight
line, and a mine punishes exactly that.

**Which item you get** is a weighted roll in which **the item you picked up
last has its weight cut to a quarter** — borrowed from kart racers, so the
same thing does not keep turning up. With dynamite as the last pickup, a
400-roll sample came out 24 % dynamite / 76 % mine.

### Movement

WASD is camera-relative; the dinosaur turns to face where it is going. The
camera drifts back behind the player 1.8 s after you stop dragging the view,
faster while running — but never while strafing or reversing, because
camera-relative movement plus naive recentring spins forever.

## The rhinos

| Variant | HP | Speed | Charge | Damage | Armour | Score |
| --- | --- | --- | --- | --- | --- | --- |
| Calf | 55 | 8.0 | 34 | 10 / 16 | — | 70 |
| Bull | 90 | 6.2 | 30 | 16 / 26 | — | 100 |
| Armored | 190 | 4.9 | 27 | 20 / 34 | 35 % | 190 |
| Matriarch | 440 | 5.6 | 33 | 26 / 44 | 20 % | 900 |

*Damage is melee gore / charge impact, before `WAVES.damageScale(wave)` is
applied — see the ramp below.*

### Charge AI

`chase → windup → charge → recover`, with `stun` and `gore` as interrupts.

A rhino inside 34 units that is facing you paws the ground for 0.85 s (dust,
head down) then commits to a straight charge for up to 1.7 s, correcting its
aim only slightly. Getting out of the way matters: **a charge that ends on a
tree, boulder or the fence stuns the rhino for 2.2 s, costs it 12 % of its
health, and damages the scenery.** Stunned and recovering rhinos take **1.65×
damage**, which is the core risk/reward loop of the game.

## Waves and the difficulty ramp

Wave *N* spawns `min(3 + floor((N − 1) × 1.1), 16)` rhinos, plus a Matriarch
every fifth wave. Calves appear from wave 2, armored rhinos from wave 6.
6.5 seconds of rest between waves, during which you heal 30 and score
`120 × N`.

The opening is deliberately soft — a first-time player used to meet five bulls
before touching the controls:

| Wave | Rhinos | Damage taken | Melon drop chance |
| --- | --- | --- | --- |
| 1 | 3 | 60 % | 38 % |
| 3 | 5 | 76 % | 34 % |
| 6 | 8 | 100 % | 28 % |
| 10 | 12 | 100 % | 20 % |
| 15+ | 16 | 100 % | 18 % |

`WAVES.damageScale(wave)` is applied to every rhino at spawn, so learning the
charge tell is survivable before the game starts hitting at full strength.

## Scoring

Score per kill is the variant's value times a combo multiplier that grows
10 % per kill up to ×2 and resets if you take a hit or go four seconds without
a kill. Kills have a 22 % chance (100 % for a Matriarch) to drop a melon that
restores 26 HP and 30 fire.

## Reading enemy health

Every living rhino carries a bar above its head, always visible — not only
after it has been hit. The fill steps through three colours so danger is
obvious at a glance: **green above 60 %, amber 30–60 %, red below 30 %**.
A pale trail shows the chunk just removed, and quarter ticks make the
proportion readable without counting pixels.

Bars hold a roughly constant on-screen size with distance and fade out past
95 units. A Matriarch also gets a full-width boss bar in the HUD, because hers
is the health that decides the wave.

**Finding them.** Rhinos you cannot pick out carry a floating pip above their
bar — gold normally, red for a Matriarch, both behind a dark inverted hull so
they stay legible against pale sky and bright grass alike.

Two conditions must both hold, and neither is a plain distance:

1. **Outside cannon range** (`FIREBALL.range`, 60 units, measured from the
   *player* rather than the camera, which trails ~23 units behind). If you can
   already hit it, you have already found it.
2. **Under 22 px tall on screen**, fading to fully opaque by 15 px.

The second rule is the interesting one: "too small to pick out" is a property
of apparent size, not distance. It makes the behaviour adapt to viewport,
field of view and the wider portrait framing for free — and it is
size-aware, so at the same 57 units a calf is marked and a Matriarch is not. And when a wave is down to its last three, any rhino that is off
screen gets an arrow at the screen edge pointing at it. The cap is deliberate:
sixteen arrows would be noise, but hunting the final straggler across a
150-unit arena is the moment you actually need help.

## Wildlife

Four species live in the arena and are **worth no score at all** — they are
scenery that can bite back. Nine are alive at a time across the whole 150-unit
arena, which is sparse on purpose: the rhinos are the fight, these are the
texture.

| Animal | HP | Speed | Bite | Notes |
| --- | --- | --- | --- | --- |
| 🐔 Ayam | 20 | 8.5 | 4 | bolts the moment you get within 16 units |
| 🦤 Dodo | 70 | 5.6 | 10 | slow, but rushes at 1.7× once it is cross |
| 🐦 Burung | 14 | 14 | 5 | cruises 7–13 units up, drops to 2.6 to dive at you |
| 🐢 Kura-kura | 120 | 2.2 | 8 | never flees; 55 % armour, and pulls its head in when hit |

Behaviour is three states. **Calm**: wander between random points, and run
from the player (within 16 units) or any rhino (within 13). **Cross**: any hit
turns the animal on you for 8 seconds — it closes and bites on its own
cooldown, then calms down. **Down**: it topples, and reappears somewhere at
least 34 units from you after 16–30 seconds, so the arena never empties.

Everything hurts them — bite, tail, breath, fireball, dynamite and mines — and
none of it scores, counts as a kill, feeds the combo, or drops a melon. They
do not block your movement either; only the scenery does. In co-op each client
runs its own wildlife locally, since nothing about them affects the run.

## Hunters and skins

Two independent choices, both above the start button, both **purely
cosmetic** — same reach, same damage, same speed, same collision radius. A
Kong bites for exactly what a T-Rex bites for.

**Form** (`rr.form`) changes the silhouette:

| Form | Silhouette |
| --- | --- |
| 🦖 T-Rex | the original |
| 🦅 Rex Bersayap | slimmer, with membrane wings that tuck against the ribs at a walk and spread when you jump |
| 🦕 Gojira | 20 % thicker, longer heavier tail, broad maple-leaf dorsal plates |
| 🦍 Kong | tail cut to a stub, barrel chest, arms 2.5× and hanging, heavy brow and a blunt muzzle, upright stance |

**Skin** (`rr.skin`) changes the colours:

| Skin | Look |
| --- | --- |
| 🦖 Jingga Klasik | the original orange with a cream belly |
| 🌿 Zamrud Rimba | jungle green, lime belly, dark green stripes |
| 🌋 Naga Magma | near-black hide with molten orange stripes and amber eyes |
| ❄️ Raja Salju | pale ice-white with cool blue stripes |
| ⚡ Badai Baja | charcoal with glowing ice-blue plates — Gojira's own |
| 🦍 Bulu Kelam | dark brown fur — Kong's own |

Each form has a default skin and brings it along when you pick it; changing
the skin afterwards always wins, so a green Kong is yours if you want one.

Both live on the same procedural body. A form is a set of dials in `FORMS`
(girth, tail length, head and arm scale, ridge style, wings, rest pose), and a
skin is three colours baked into the mesh's vertex colours as it is swept —
which is why `Rex.setForm()` and `Rex.setSkin()` rebuild the model rather than
tint it. Only ever done from the menu; position, health and cooldowns live on
the instance, not the model.

## Arenas

Three places to fight, picked from **Arena** in the menu and remembered in
`localStorage` under `rr.arena`. They are **cosmetic only**: same 150-unit
radius, same scenery counts, same rhinos, same scoring — so no arena is easier
than another and leaderboard entries stay comparable.

| Arena | Look | Details |
| --- | --- | --- |
| 🌿 Padang Ceria | bright meadow, blue sky | flowers, leafy trees, wooden posts |
| 🌋 Kawah Vulkanik | dark basalt under a purple-to-orange sky | glowing lava pools, rising embers, burnt-out snags, obsidian shards, volcanoes with lit craters |
| 🐊 Rawa Berkabut | misty wetland | standing water, tall reeds, mangroves on stilt roots, fireflies, short fog |

Every arena is one entry in `ARENAS` (`js/config.js`): palette, fog, light
levels, ground texture colours, and switches for the tree style
(`leafy` / `charred` / `mangrove`), the fence style (`post` / `shard`), the
motes (`flower` / `ember` / `firefly`) and the pools. `js/world.js` reads
nothing else, so a fourth arena is a new entry, not new code.

Switching is live — `Game.setArena()` disposes the old `World` and builds the
new one, even mid-run. In co-op the guest is switched to the host's arena by
the `welcome` message, so both players see the same place.

## Destructible scenery

Trees and boulders inside the arena have health and come back later, so the
battlefield keeps changing without ever emptying out.

| Source | Damage |
| --- | --- |
| Fire breath | 26/s, and sets a 5 s burn at 16/s |
| Fireball blast | 90 at the centre, with falloff |
| Tail spin | 34 to everything in the sweep |
| Rhino crash | 55 × the rhino's scale |

A burning tree chars visibly — trunk and leaves darken, flames lick above it —
and keeps losing health after the flame stops. When it dies it tips over and
leaves a **charred stump**; a boulder flattens into **rubble**. Both stop
blocking movement immediately, then regrow with a springy animation after 26 s
(trees) or 34 s (boulders).

Burning down your cover is a real trade: no trees means no charge-crash stuns
until they come back.

## Death, revives and resuming

Solo, the first death **from wave 2 onwards** offers **one free revive**: you
stand back up
with 60 HP, three seconds of invulnerability, and every rhino within 22 units
thrown clear and stunned. The second death ends the run. Dying on wave 1 skips
the prompt entirely — that early, a fast restart beats a decision. In co-op there is no
revive prompt — you are down for 6 seconds and respawn, and the run only ends
when every player is down at once.

A run is **autosaved** to `localStorage` every 5 seconds, whenever a wave is
cleared, on pause, and when the tab is hidden or closed. If a saved run is less
than 24 hours old and reached wave 2, the menu offers
**▶ LANJUTKAN — GELOMBANG N · score**. Resuming restarts at the beginning of
that wave with your score, kills, health and remaining revive intact; the world
itself is not restored, which keeps the save honest and tiny. Starting a fresh
run or reaching a real game over clears it.

Beating your furthest wave raises a **REKOR BARU!** banner mid-run.
