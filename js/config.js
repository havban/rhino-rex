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
