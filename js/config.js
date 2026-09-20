// Rhino Rex — central tuning values.
// Everything that a designer would want to poke lives here.

export const WORLD = {
  radius: 150,            // playable arena radius (soft wall)
  groundSize: 420,
  fogNear: 90,
  fogFar: 320,
  gravity: -26,
};

export const REX = {
  radius: 2.0,            // collision radius
  height: 4.4,
  walkSpeed: 13,
  sprintSpeed: 21,
  accel: 60,
  friction: 9,
  turnLerp: 9,            // how fast the body yaws toward the move/aim direction
  jumpSpeed: 12,
  maxHp: 100,
  hpRegen: 3.5,           // hp per second, after not being hit for a while
  regenDelay: 5.0,
  maxFire: 100,
  fireRegen: 15,          // per second
  fireCost: 27,           // per second while breathing
  fireMinToStart: 18,
  stomina: 100,
};

export const FIREBALL = {
  range: 60,              // how far the cannon will lob and auto-aim
  damage: 58,             // direct hit
  splashDamage: 34,       // at the centre of the blast, falls off to zero at `splash`
  splash: 7.0,
  speed: 46,
  gravity: -11,           // gentle arc, so you lead distant targets
  life: 3.2,
  radius: 0.75,
  cost: 40,               // drains the same meter as the breath
  cooldown: 4.0,          // slow enough to stay a decision, short enough not to feel dead
  burn: { time: 3.6, dps: 13 },
  knockback: 18,
};

export const ATTACK = {
  bite: {
    damage: 26,
    range: 7.2,
    halfAngle: Math.PI * 0.30,
    cooldown: 0.62,
    windup: 0.13,         // time before the hit lands
    active: 0.12,
    knockback: 7,
  },
  tail: {
    damage: 21,
    range: 10.2,
    halfAngle: Math.PI,       // the body spins a full turn, so the sweep is 360°
    cooldown: 1.5,
    windup: 0.30,             // turn towards the target, then start spinning
    active: 0.45,             // the spin itself
    knockback: 26,
    stun: 1.1,
    aimRange: 15,             // look this far for something to turn towards
  },
  fireball: {
    damage: 0,            // the projectile carries the damage (see FIREBALL)
    range: 0,
    halfAngle: 0,
    cooldown: FIREBALL.cooldown,
    windup: 0.26,
    active: 0.12,
  },
  fire: {
    dps: 42,              // damage per second inside the cone
    range: 22,
    halfAngle: Math.PI * 0.19,
    burnDps: 11,
    burnTime: 3.2,
  },
};

export const IMPACT = {
  sparksPerHit: 9,
  sparksPerKill: 24,
  spark: 0xfff0b8,
  sparkFade: 0xff9a3c,
};

// Trees and boulders take damage and come back later, so the arena keeps
// changing shape during a run without ever emptying out.
export const SCENERY = {
  treeHp: 100,
  rockHp: 170,
  burnDps: 16,            // a tree left alight keeps losing health
  burnTime: 5.0,
  smashDamage: 55,        // a rhino ending its charge on the scenery
  tailDamage: 34,
  fireDps: 26,            // the breath, per second inside the cone
  blastDamage: 90,        // fireball, at the centre of the blast
  respawnTree: 26,
  respawnRock: 34,
  fallTime: 1.1,          // how long the topple/crumble animation runs
  growTime: 1.6,
};

export const RHINO = {
  base: {
    hp: 90, speed: 6.2, chargeSpeed: 30, damage: 16, chargeDamage: 26,
    scale: 1, color: 0x9aa4b2, score: 100,
  },
  // Variants unlock as the waves climb.
  variants: {
    calf:    { hp: 55,  speed: 8.0, chargeSpeed: 34, damage: 10, chargeDamage: 16, scale: 0.72, color: 0xbfc9d6, score: 70 },
    bull:    { hp: 90,  speed: 6.2, chargeSpeed: 30, damage: 16, chargeDamage: 26, scale: 1.0,  color: 0x9aa4b2, score: 100 },
    armored: { hp: 190, speed: 4.9, chargeSpeed: 27, damage: 20, chargeDamage: 34, scale: 1.22, color: 0x7d8796, score: 190, armor: 0.35 },
    matriarch:{hp: 440, speed: 5.6, chargeSpeed: 33, damage: 26, chargeDamage: 44, scale: 1.75, color: 0xb08d6a, score: 900, armor: 0.2, boss: true },
  },
  senseRange: 120,
  chargeTrigger: 34,      // starts the paw-stomp wind-up inside this range
  chargeWindup: 0.85,
  chargeTime: 1.7,        // max seconds of a charge before it fizzles
  chargeRecover: 0.9,
  crashStun: 2.2,         // stun after slamming into scenery / missing badly
  attackCooldown: 1.4,
  separation: 4.6,
};

export const WAVES = {
  restBetween: 6.5,
  restHeal: 30,

  // Gentle opening, steady climb. Wave 1 used to throw five bulls at a player
  // who had never held the controls; it now starts at three and adds one a
  // wave, reaching the old numbers around wave 8 and capping at 16.
  count(wave) {
    return Math.min(3 + Math.floor((wave - 1) * 1.1), 16);
  },

  // Rhinos hit softer for the first few waves, so learning the charge tell is
  // survivable. Full damage from wave 6 on.
  damageScale(wave) {
    return Math.min(1, 0.6 + (wave - 1) * 0.08);
  },

  // Melons are common while you are still learning, then settle down.
  dropChance(wave) {
    return Math.max(0.18, 0.4 - wave * 0.02);
  },

  composition(wave) {
    const out = [];
    const n = this.count(wave);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (wave >= 6 && r < 0.14 + wave * 0.015) out.push('armored');
      else if (r < 0.34 && wave >= 2) out.push('calf');
      else out.push('bull');
    }
    if (wave % 5 === 0) out.push('matriarch');
    return out;
  },
};

/**
 * Weapon drops. You carry one item at a time, as in a kart racer, and the
 * roll is weighted *against whatever you picked up last* so the same thing
 * does not keep turning up.
 */
export const ITEMS = {
  dropChance: 0.16,        // per kill, on top of the melon roll
  repeatWeight: 0.25,      // last item's weight is multiplied by this
  kinds: {
    dinamit: {
      label: 'Dinamit', glyph: '🧨', weight: 1.0, charges: 3,
      fuse: 1.15,          // seconds before it goes off in the air or on the ground
      damage: 95, splash: 10.5, knockback: 26, stun: 1.2,
      speed: 34, gravity: -22,
    },
    ranjau: {
      label: 'Ranjau', glyph: '💣', weight: 0.85, charges: 2,
      arm: 0.8,            // seconds before it becomes live
      life: 30,            // and how long it waits for someone to step on it
      trigger: 3.4,
      damage: 130, splash: 9, knockback: 34, stun: 2.0,
    },
  },
};

// Saved runs and the one free revive - the reasons to come back to a run.
export const PROGRESS = {
  key: 'rr.run',
  maxAgeHours: 24,
  autosaveEvery: 5,       // seconds between quiet autosaves
  revivesPerRun: 1,
  reviveHp: 60,
  reviveGrace: 3.0,       // seconds of invulnerability after standing back up
  reviveClearRadius: 22,  // rhinos this close get thrown clear
};

export const CAMERA = {
  distance: 21,
  height: 10.4,
  lookHeight: 4.3,
  lookAhead: 5.5,         // aim the camera a little in front of the rex
  shoulder: 3.2,          // slight over-the-shoulder offset so the tail does not block the view
  minDistance: 15,        // never let scenery shove the camera closer than this
  fov: 62,
  lerp: 7.5,
  pitchMin: -0.85,
  pitchMax: 1.15,
  sensitivity: 0.0026,
  pitchDefault: 0.12,
  recenterDelay: 1.8,       // grace period after the player drags the view
  recenterIdle: 1.0,        // how briskly the camera drifts back when standing still
  recenterMoving: 4.5,      // ... and when running
  lateralDeadzone: 0.45,    // strafing must not drag the camera round (feedback spin)
};

/**
 * Wildlife. Background animals that make the arena feel inhabited. They are
 * worth **no score** - they are scenery that can bite back. Left alone they
 * wander and flee; hit one and it turns on you for a while, then calms down.
 * Kept deliberately few: the rhinos are the fight, these are the texture.
 */
export const WILDLIFE = {
  total: 9,                 // alive at once, across the whole arena
  respawn: [16, 30],        // seconds before a dead one reappears somewhere else
  fleeRange: 16,            // how close you get before a calm animal bolts
  rhinoFleeRange: 13,       // ... and how close a charging rhino has to be
  angerTime: 8.0,           // seconds it stays cross after being hit
  minSpawnDist: 34,         // never pop into existence in your lap
  kinds: {
    ayam: {
      label: 'Ayam', max: 3, weight: 3,
      hp: 20, speed: 8.5, scale: 2.0, radius: 0.8, hitY: 1.5,
      damage: 4, range: 3.0, attackCd: 1.1, flee: true,
    },
    dodo: {
      label: 'Dodo', max: 2, weight: 2,
      hp: 70, speed: 5.6, scale: 1.9, radius: 1.1, hitY: 2.3,
      damage: 10, range: 3.6, attackCd: 1.7, flee: true, rush: 1.7,
    },
    burung: {
      label: 'Burung', max: 3, weight: 3,
      hp: 14, speed: 14, scale: 1.7, radius: 0.8, hitY: 0.8,
      damage: 5, range: 3.2, attackCd: 2.0, flee: true,
      fly: { cruise: [7, 13], dive: 2.6 },
    },
    kurakura: {
      label: 'Kura-kura', max: 2, weight: 1.4,
      hp: 120, speed: 2.2, scale: 2.0, radius: 1.0, hitY: 1.2,
      damage: 8, range: 2.8, attackCd: 1.6, flee: false, armor: 0.55,
    },
  },
};

/**
 * T-Rex skins. Purely cosmetic: same size, same reach, same everything.
 * `body`, `belly` and `stripe` are baked into the body mesh's vertex colours,
 * so changing skin rebuilds the model (only ever done from the menu).
 */
export const SKINS = {
  jingga: { label: 'Jingga Klasik', short: 'Jingga', glyph: '\u{1F996}', body: 0xff8a3d, belly: 0xffe2b0, stripe: 0xd94f18, tongue: 0xf07a8f, eye: 0xfffdf5, pupil: 0x1d120a },
  zamrud: { label: 'Zamrud Rimba', short: 'Zamrud', glyph: '\u{1F33F}', body: 0x46b45f, belly: 0xeaf6b4, stripe: 0x1d6b3c, tongue: 0xe8748c, eye: 0xfff7d8, pupil: 0x10240f },
  magma:  { label: 'Naga Magma', short: 'Magma', glyph: '\u{1F30B}', body: 0x4b3436, belly: 0xffab4d, stripe: 0xff4d0a, tongue: 0xff9a6a, eye: 0xffd070, pupil: 0x140a06 },
  salju:  { label: 'Raja Salju', short: 'Salju', glyph: '\u{2744}\uFE0F', body: 0xe4edf8, belly: 0xffffff, stripe: 0x74a8dd, tongue: 0xf3a0b4, eye: 0xeaf6ff, pupil: 0x12233a },
};

/**
 * Arenas. Same rules and the same arena size everywhere - only the look
 * changes, so nothing here can make one harder than another. Every value is
 * fed to js/world.js, which builds the whole place procedurally.
 */
export const ARENAS = {
  padang: {
    label: 'Padang Ceria', short: 'Padang', glyph: '\u{1F33F}',
    background: 0x8fd9ff,
    sky: { top: 0x4fb8ff, horizon: 0xfff0d0 },
    fog: { color: 0xcdeeff, near: 90, far: 320 },
    hemi: { sky: 0xdff3ff, ground: 0x5d8e42, intensity: 0.95 },
    sun: { color: 0xfff6d8, intensity: 2.0, dir: [0.45, 0.62, -0.5] },
    ambient: { color: 0xfff4e0, intensity: 0.22 },
    ground: { base: '#6fbe46', flecks: ['rgba(96,180,64,.9)', 'rgba(142,210,88,.85)', 'rgba(74,152,52,.8)', 'rgba(236,226,122,.5)'] },
    patch: { color: 0xffe9a8, opacity: 0.16 },
    blades: { hue: 0.24, spread: 0.07, sat: 0.62, light: 0.48, density: 1, height: 1, width: 1 },
    motes: { kind: 'flower', colors: [0xff6f91, 0xffd93d, 0xff9f68, 0xf5f7ff, 0xc77dff], density: 1, size: 1 },
    tree: { style: 'leafy', bark: 0xa9703f, leaves: [0x62c94a, 0x7fd65c, 0x4fb53d], stump: 0x4a3a2c },
    rock: { color: 0xb9b0a2, emissive: 0x000000, glow: 0 },
    clouds: { color: 0xffffff, emissive: 0xdfefff, intensity: 0.35, density: 1, y: 55, flat: 0.62 },
    hills: { hue: 0.28, sat: 0.35, light: 0.52, height: 1, width: 1, cap: null },
    fence: { color: 0xd9a86c, style: 'post' },
    pools: null,
  },

  vulkanik: {
    label: 'Kawah Vulkanik', short: 'Vulkanik', glyph: '\u{1F30B}',
    background: 0x8c4a3f,
    sky: { top: 0x3b1f63, horizon: 0xff9a3c },
    // light fog only: the crater should look hot, not smothered
    fog: { color: 0xb4663f, near: 150, far: 430 },
    hemi: { sky: 0xffb070, ground: 0x4a1c16, intensity: 0.55 },
    sun: { color: 0xffc98c, intensity: 1.5, dir: [-0.4, 0.5, -0.55] },
    ambient: { color: 0xff8a44, intensity: 0.18 },
    ground: { base: '#463943', flecks: ['rgba(52,40,48,.92)', 'rgba(82,64,70,.85)', 'rgba(198,80,26,.5)', 'rgba(255,150,54,.3)'] },
    patch: { color: 0xff5a10, opacity: 0.12 },
    blades: { hue: 0.06, spread: 0.04, sat: 0.5, light: 0.34, density: 0.35, height: 0.75, width: 1.1 },
    motes: { kind: 'ember', colors: [0xff8c28, 0xffc247, 0xff5a1e], density: 1.3, size: 0.6 },
    tree: { style: 'charred', bark: 0x4a3b3e, leaves: [0x3b2d30, 0x473539, 0x2f2426], stump: 0x2b2224 },
    rock: { color: 0x51454d, emissive: 0x7a2604, glow: 0.18 },
    clouds: { color: 0x7d6470, emissive: 0x3a1f2c, intensity: 0.2, density: 0.8, y: 70, flat: 0.5 },
    hills: { hue: 0.94, sat: 0.28, light: 0.16, height: 1.35, width: 0.9, cap: 0xff6a1e },
    fence: { color: 0x3a2f35, style: 'shard' },
    pools: { count: 11, color: 0xff5406, emissive: 0xff4d00, opacity: 0.96, size: 1.0 },
  },

  rawa: {
    label: 'Rawa Berkabut', short: 'Rawa', glyph: '\u{1F40A}',
    background: 0x9ed9cf,
    sky: { top: 0x63c9c0, horizon: 0xe6f7cf },
    fog: { color: 0xb6ded1, near: 48, far: 205 },
    hemi: { sky: 0xcdeee2, ground: 0x24452e, intensity: 0.85 },
    sun: { color: 0xeaffd8, intensity: 1.55, dir: [0.3, 0.55, 0.6] },
    ambient: { color: 0xcfeade, intensity: 0.24 },
    ground: { base: '#3f6149', flecks: ['rgba(44,74,52,.92)', 'rgba(72,110,78,.85)', 'rgba(48,104,96,.7)', 'rgba(118,146,92,.4)'] },
    patch: { color: 0x3fae94, opacity: 0.18 },
    blades: { hue: 0.3, spread: 0.06, sat: 0.5, light: 0.36, density: 1.25, height: 1.9, width: 0.7 },
    motes: { kind: 'firefly', colors: [0xd8ff6a, 0xa8ff8a, 0xfff3a0], density: 0.8, size: 0.7 },
    tree: { style: 'mangrove', bark: 0x5d4d3a, leaves: [0x2d7048, 0x458a5c, 0x1f5a3a], stump: 0x3a3226 },
    rock: { color: 0x74805e, emissive: 0x000000, glow: 0 },
    clouds: { color: 0xdff2ea, emissive: 0xbfe0d6, intensity: 0.3, density: 1.1, y: 34, flat: 0.34 },
    hills: { hue: 0.33, sat: 0.32, light: 0.34, height: 0.75, width: 1.3, cap: null },
    fence: { color: 0x7a8a5c, style: 'post' },
    pools: { count: 22, color: 0x2f93a8, emissive: 0x000000, opacity: 0.52, size: 1.9 },
  },
};

export const COLORS = {
  sky: 0x8fd9ff,
  horizon: 0xfff2cf,
  ground: 0x8fd06a,
  groundAlt: 0x7cc45c,
  sun: 0xfff6d8,
  rexBody: 0xff8a3d,
  rexBelly: 0xffe2b0,
  rexStripe: 0xd94f18,
  fire: 0xffb23d,
  fireHot: 0xfff4c0,
};
