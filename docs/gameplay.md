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
| ☄️ Fireball | `R` / `E` | 58 direct + 34 splash | ~14–58 lobbed | 3.0 s | Costs 40 fire; 7-unit blast with falloff, burn and knockback |

Two details that matter:

- **The fire cone is tested flat.** The T-Rex's mouth is ~5.5 units up, so a
  true 3D cone sails over anything standing close. Damage uses a horizontal
  cone from the body; only the visuals come from the mouth.
- **The tail spin is a visual yaw offset**, not a change to the player's
  facing. The camera and aim never rotate with it, so a 360° attack does not
  spin the screen.

Attack presses are buffered for 0.28 s, so a press during another animation
fires as soon as it can rather than being dropped.

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
