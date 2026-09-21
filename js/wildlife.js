/**
 * Wildlife: the animals that live in the arena rather than fight over it.
 *
 * They are worth no score and never count towards a wave. Left alone they
 * potter about and bolt when something big comes near; hit one and it turns
 * on you for a few seconds and pecks back, then calms down. Kill one and it
 * reappears somewhere else a while later, so the arena never empties.
 *
 * Deliberately sparse (nine at a time across a 150-unit arena) and smaller
 * than any rhino, so they read as scenery at a glance and never hide the
 * fight.
 */
import * as THREE from 'three';
import { WORLD, WILDLIFE } from './config.js';
import { ellipsoid, capsule, cone, skinMaterial } from './geom.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const wrapPi = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// ---------------------------------------------------------------- models --
// Each builder returns the parts the animator needs; everything else just
// hangs off the group. Built facing +Z, one unit ≈ one unit of the world,
// then scaled by the species' `scale`.

function chicken() {
  const g = new THREE.Group();
  const white = skinMaterial(0xfdfbf4);
  const comb = skinMaterial(0xe8453a);
  const beakM = skinMaterial(0xf5a623);
  const dark = skinMaterial(0x6b5a4a);

  const body = ellipsoid(0.42, 0.44, 0.55, white, 16);
  body.position.y = 0.66;
  g.add(body);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.26);
  g.add(head);
  const skull = ellipsoid(0.24, 0.26, 0.24, white, 14);
  head.add(skull);
  const beak = cone(0.09, 0.24, beakM, 8);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.02, 0.28);
  head.add(beak);
  for (let i = 0; i < 3; i++) {
    const c = ellipsoid(0.07, 0.11, 0.06, comb, 8);
    c.position.set(0, 0.26, -0.08 + i * 0.09);
    head.add(c);
  }
  const wattle = ellipsoid(0.06, 0.09, 0.05, comb, 8);
  wattle.position.set(0, -0.2, 0.2);
  head.add(wattle);
  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.05, 0.05, 0.04, skinMaterial(0x1d120a), 8);
    eye.position.set(sx * 0.17, 0.06, 0.16);
    head.add(eye);
  }

  const wings = [];
  for (const sx of [-1, 1]) {
    const w = ellipsoid(0.1, 0.24, 0.36, white, 12);
    w.position.set(sx * 0.4, 0.72, 0.02);
    g.add(w);
    wings.push(w);
  }
  for (let i = 0; i < 3; i++) {
    const t = cone(0.1, 0.42, i === 1 ? dark : white, 7);
    t.position.set((i - 1) * 0.13, 0.9, -0.5);
    t.rotation.x = -2.5 + (i - 1) * 0.12;
    g.add(t);
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.16, 0.36, 0);
    const shank = capsule(0.055, 0.3, beakM, 8);
    shank.position.y = -0.16;
    leg.add(shank);
    const foot = ellipsoid(0.1, 0.05, 0.16, beakM, 8);
    foot.position.set(0, -0.34, 0.06);
    leg.add(foot);
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, head, wings, legs, mats: [white, comb, beakM, dark] };
}

function dodo() {
  const g = new THREE.Group();
  const plume = skinMaterial(0x9aa7bd);
  const pale = skinMaterial(0xd7dced);
  const beakM = skinMaterial(0xe9c15a);
  const foot = skinMaterial(0xc9953f);

  const body = ellipsoid(0.78, 0.84, 0.98, plume, 18);
  body.position.y = 1.0;
  g.add(body);
  const chest = ellipsoid(0.56, 0.5, 0.42, pale, 14);
  chest.position.set(0, 0.86, 0.6);
  g.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 1.86, 0.34);
  g.add(head);
  const skull = ellipsoid(0.36, 0.38, 0.4, plume, 16);
  head.add(skull);
  const hood = ellipsoid(0.33, 0.24, 0.3, pale, 12);
  hood.position.set(0, 0.16, 0.06);
  head.add(hood);
  const upper = cone(0.17, 0.62, beakM, 10);
  upper.rotation.x = Math.PI / 2 + 0.22;
  upper.position.set(0, -0.02, 0.5);
  head.add(upper);
  const hook = ellipsoid(0.11, 0.14, 0.12, beakM, 10);
  hook.position.set(0, -0.14, 0.74);
  head.add(hook);
  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.07, 0.07, 0.05, skinMaterial(0x201812), 8);
    eye.position.set(sx * 0.25, 0.1, 0.24);
    head.add(eye);
  }

  const wings = [];
  for (const sx of [-1, 1]) {
    const w = ellipsoid(0.14, 0.3, 0.34, plume, 12);
    w.position.set(sx * 0.7, 1.05, -0.02);
    g.add(w);
    wings.push(w);
  }
  for (let i = 0; i < 4; i++) {
    const t = ellipsoid(0.1, 0.16, 0.3, pale, 10);
    t.position.set((i - 1.5) * 0.17, 1.35 + Math.abs(i - 1.5) * 0.05, -0.86);
    t.rotation.x = 0.5;
    g.add(t);
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.3, 0.52, 0);
    const shank = capsule(0.11, 0.34, foot, 9);
    shank.position.y = -0.2;
    leg.add(shank);
    const toe = ellipsoid(0.17, 0.08, 0.26, foot, 9);
    toe.position.set(0, -0.46, 0.1);
    leg.add(toe);
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, head, wings, legs, mats: [plume, pale, beakM, foot] };
}

function bird() {
  const g = new THREE.Group();
  const coat = skinMaterial(0x4a78c8);
  const belly = skinMaterial(0xfff0c2);
  const beakM = skinMaterial(0xffb23d);

  const body = ellipsoid(0.3, 0.28, 0.58, coat, 14);
  body.position.y = 0.3;
  g.add(body);
  const front = ellipsoid(0.22, 0.2, 0.3, belly, 12);
  front.position.set(0, 0.22, 0.28);
  g.add(front);

  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.46);
  g.add(head);
  head.add(ellipsoid(0.21, 0.21, 0.21, coat, 12));
  const beak = cone(0.075, 0.28, beakM, 8);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.02, 0.26);
  head.add(beak);
  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.045, 0.045, 0.035, skinMaterial(0x141019), 8);
    eye.position.set(sx * 0.14, 0.06, 0.15);
    head.add(eye);
  }

  // wings pivot at the shoulder so a flap is one rotation
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.2, 0.36, 0.02);
    const w = ellipsoid(0.62, 0.05, 0.3, coat, 12);
    w.position.x = sx * 0.6;
    pivot.add(w);
    const tip = ellipsoid(0.3, 0.04, 0.16, belly, 10);
    tip.position.set(sx * 1.16, 0, -0.06);
    pivot.add(tip);
    g.add(pivot);
    wings.push(pivot);
  }
  const tail = ellipsoid(0.22, 0.04, 0.34, coat, 10);
  tail.position.set(0, 0.32, -0.62);
  g.add(tail);
  return { group: g, head, wings, legs: [], mats: [coat, belly, beakM] };
}

function tortoise() {
  const g = new THREE.Group();
  const shellM = skinMaterial(0x4e7a3a);
  const plate = skinMaterial(0x77a34c);
  const hide = skinMaterial(0xb9a06a);

  const shell = ellipsoid(0.92, 0.6, 1.08, shellM, 18);
  shell.position.y = 0.66;
  g.add(shell);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const scute = ellipsoid(0.22, 0.12, 0.22, plate, 10);
    scute.position.set(Math.cos(a) * 0.5, 1.02, Math.sin(a) * 0.6);
    g.add(scute);
  }
  const crown = ellipsoid(0.3, 0.14, 0.3, plate, 12);
  crown.position.y = 1.16;
  g.add(crown);
  const belly = ellipsoid(0.86, 0.16, 1.0, hide, 14);
  belly.position.y = 0.3;
  g.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.92);
  g.add(head);
  head.add(ellipsoid(0.24, 0.22, 0.32, hide, 12));
  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.05, 0.05, 0.04, skinMaterial(0x1a1410), 8);
    eye.position.set(sx * 0.14, 0.07, 0.2);
    head.add(eye);
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.62, 0.34, sz * 0.62);
      const l = capsule(0.17, 0.16, hide, 9);
      l.rotation.z = sx * 0.4;
      leg.add(l);
      g.add(leg);
      legs.push(leg);
    }
  }
  return { group: g, head, wings: [], legs, mats: [shellM, plate, hide] };
}

function boar() {
  const g = new THREE.Group();
  const hide = skinMaterial(0x6d5340);
  const dark = skinMaterial(0x4a382b);
  const tusk = skinMaterial(0xfdf3d8);
  const snoutM = skinMaterial(0x8a6a52);

  const body = ellipsoid(0.62, 0.66, 1.05, hide, 16);
  body.position.y = 0.92;
  g.add(body);
  const shoulder = ellipsoid(0.68, 0.72, 0.6, hide, 14);
  shoulder.position.set(0, 1.02, 0.45);
  g.add(shoulder);

  // a bristly ridge down the spine, which is what says "boar" at a glance
  for (let i = 0; i < 6; i++) {
    const bristle = cone(0.09, 0.42 - i * 0.03, dark, 5);
    bristle.position.set(0, 1.62 - i * 0.04, 0.62 - i * 0.26);
    bristle.rotation.x = -0.35;
    g.add(bristle);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.95);
  g.add(head);
  head.add(ellipsoid(0.42, 0.42, 0.5, hide, 14));
  const snout = ellipsoid(0.26, 0.24, 0.42, snoutM, 12);
  snout.position.set(0, -0.14, 0.52);
  head.add(snout);
  for (const sx of [-1, 1]) {
    const ear = cone(0.13, 0.3, dark, 6);
    ear.position.set(sx * 0.3, 0.38, -0.05);
    ear.rotation.set(-0.3, 0, sx * 0.3);
    head.add(ear);
    const t = cone(0.06, 0.34, tusk, 6);
    t.position.set(sx * 0.2, -0.16, 0.6);
    t.rotation.set(-0.5, 0, sx * -0.35);
    head.add(t);
    const eye = ellipsoid(0.06, 0.06, 0.05, skinMaterial(0x16100b), 8);
    eye.position.set(sx * 0.3, 0.12, 0.3);
    head.add(eye);
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.36, 0.52, sz * 0.5);
      const l = capsule(0.13, 0.42, dark, 8);
      l.position.y = -0.22;
      leg.add(l);
      const hoof = ellipsoid(0.15, 0.1, 0.17, skinMaterial(0x2a2119), 8);
      hoof.position.y = -0.48;
      leg.add(hoof);
      g.add(leg);
      legs.push(leg);
    }
  }
  const tail = capsule(0.05, 0.26, dark, 6);
  tail.position.set(0, 1.1, -1.02);
  tail.rotation.x = 0.5;
  g.add(tail);
  return { group: g, head, wings: [], legs, mats: [hide, dark, tusk, snoutM] };
}

function monitor() {
  const g = new THREE.Group();
  const scale = skinMaterial(0x5a6448);
  const pale = skinMaterial(0x9aa477);
  const tongueM = skinMaterial(0xd4576a);

  const body = ellipsoid(0.44, 0.34, 1.0, scale, 16);
  body.position.y = 0.5;
  g.add(body);
  // a long tail in three tapering segments
  for (let i = 0; i < 3; i++) {
    const seg = ellipsoid(0.26 - i * 0.07, 0.2 - i * 0.05, 0.55 - i * 0.1, scale, 10);
    seg.position.set(0, 0.48 - i * 0.04, -1.1 - i * 0.85);
    g.add(seg);
  }
  const back = ellipsoid(0.3, 0.14, 0.7, pale, 10);
  back.position.set(0, 0.78, 0.1);
  g.add(back);

  const head = new THREE.Group();
  head.position.set(0, 0.52, 1.0);
  g.add(head);
  head.add(ellipsoid(0.26, 0.2, 0.42, scale, 12));
  const jaw = ellipsoid(0.2, 0.09, 0.34, pale, 10);
  jaw.position.set(0, -0.14, 0.1);
  head.add(jaw);
  const tongue = capsule(0.025, 0.24, tongueM, 6);
  tongue.position.set(0, -0.08, 0.6);
  tongue.rotation.x = Math.PI / 2;
  head.add(tongue);
  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.07, 0.07, 0.06, skinMaterial(0xf2d24b), 8);
    eye.position.set(sx * 0.2, 0.12, 0.12);
    head.add(eye);
    const pupil = ellipsoid(0.03, 0.05, 0.03, skinMaterial(0x14100a), 8);
    pupil.position.set(sx * 0.24, 0.12, 0.17);
    head.add(pupil);
  }

  // splayed, lizard-fashion, so it reads low and wide
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.42, 0.34, sz * 0.52);
      const upper = capsule(0.1, 0.3, scale, 8);
      upper.rotation.z = sx * 1.0;
      upper.position.set(sx * 0.16, 0, 0);
      leg.add(upper);
      const foot = ellipsoid(0.16, 0.06, 0.18, scale, 8);
      foot.position.set(sx * 0.34, -0.22, 0.04);
      leg.add(foot);
      g.add(leg);
      legs.push(leg);
    }
  }
  return { group: g, head, wings: [], legs, mats: [scale, pale, tongueM] };
}

const BUILD = { ayam: chicken, dodo, burung: bird, kurakura: tortoise, babi: boar, biawak: monitor };

// --------------------------------------------------------------- critter --

class Critter {
  constructor(scene, kind) {
    this.scene = scene;
    this.kind = kind;
    this.cfg = WILDLIFE.kinds[kind];
    const built = BUILD[kind]();
    this.parts = built;
    this.root = built.group;
    this.root.scale.setScalar(this.cfg.scale);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(this.root);

    this.pos = new THREE.Vector3();
    this.radius = this.cfg.radius * this.cfg.scale;
    this.hitY = this.cfg.hitY * this.cfg.scale;
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * TAU;
    this.phase = Math.random() * TAU;
    // Gait and wingbeat are integrated at their current rate. Multiplying an
    // already-accumulated phase by a speed-dependent rate makes the argument
    // jump every time the speed twitches, which is what made the flapping
    // and the walk stutter.
    this.gait = Math.random() * TAU;
    this.wingPhase = Math.random() * TAU;
    this.flapRate = 11;
    this.pitch = 0;
    this.animSpeed = 0;
    this.hopY = 0;
    this.target = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);   // filtered facing, not the raw wish
    this.stuck = 0;
    this.wanderFor = 0;
    this.anger = 0;
    this.attackCd = 0;
    this.lunge = 0;
    this.flash = 0;
    this.tuck = 0;              // tortoise pulling in after a hit
    this.alive = false;
    this.dying = 0;
    this.respawnIn = 0;
    this.height = 0;            // flyers only
    this.hp = this.cfg.hp;
  }

  get angry() { return this.anger > 0; }

  place(pos) {
    this.pos.copy(pos);
    this.alive = true;
    this.dying = 0;
    this.hp = this.cfg.hp;
    this.anger = 0;
    this.attackCd = 0;
    this.flash = 0;
    this.tuck = 0;
    this.vel.set(0, 0, 0);
    this.height = this.cfg.fly ? rnd(...this.cfg.fly.cruise) : 0;
    this.heading.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.stuck = 0;
    this.root.visible = true;
    this.root.scale.setScalar(this.cfg.scale);
    this.root.rotation.set(0, this.yaw, 0);
    this._newWanderTarget();
  }

  _newWanderTarget() {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * (WORLD.radius - 8);
    this.target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    this.wanderFor = rnd(3, 8);
  }

  /** Returns the damage actually taken, so the caller can show a number. */
  hit(amount, { knock = null, anger = true } = {}) {
    if (!this.alive) return 0;
    const dealt = amount * (1 - (this.cfg.armor || 0));
    this.hp -= dealt;
    this.flash = 0.3;
    if (anger) this.anger = WILDLIFE.angerTime;
    if (this.cfg.armor) this.tuck = 0.9;
    if (knock) {
      this.vel.addScaledVector(knock, 6 / (1 + (this.cfg.armor || 0) * 4));
    }
    if (this.hp <= 0) this._die();
    return dealt;
  }

  _die() {
    this.alive = false;
    this.dying = 1.0;
    this.respawnIn = rnd(...WILDLIFE.respawn);
  }

  /**
   * One step. Returns the damage it lands on the player this frame (0 mostly).
   * `threats` are the things it runs away from besides the player.
   */
  update(dt, player, world, threats, canHarm) {
    if (!this.alive) {
      if (this.dying > 0) {
        this.dying -= dt * 1.4;
        const u = Math.max(0, this.dying);
        this.root.rotation.z = (1 - u) * 1.4;
        this.root.position.y = this.cfg.fly ? this.height * u : 0;
        if (u < 0.35) this.root.scale.setScalar(this.cfg.scale * (u / 0.35));
        if (u <= 0) { this.root.visible = false; this.dying = 0; }
      }
      return 0;
    }

    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.tuck = Math.max(0, this.tuck - dt);
    this.anger = Math.max(0, this.anger - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.lunge = Math.max(0, this.lunge - dt * 3.5);

    const cfg = this.cfg;
    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const distP = toPlayer.length();
    let want = null;                 // direction we would like to move
    let speed = cfg.speed * 0.35;
    let damage = 0;

    if (this.angry && player.alive) {
      // charge the thing that hurt us
      want = toPlayer.clone().normalize();
      speed = cfg.speed * (cfg.rush && distP > 8 ? cfg.rush : 1);
      // Something on the ground cannot peck a flying player; a bird can, and
      // climbs after one (see _cruise / the dive target below).
      const gap = cfg.fly ? Math.abs(this.height - (player.y || 0)) : Math.max(0, (player.y || 0) - 2.2);
      const reach = Math.hypot(distP, gap);
      if (reach < cfg.range + this.radius && this.attackCd <= 0) {
        this.attackCd = cfg.attackCd;
        this.lunge = 1;
        if (canHarm && player.damage(cfg.damage, want.clone())) damage = cfg.damage;
      }
    } else {
      // calm: bolt from anything big and close, otherwise potter about
      let away = null;
      if (cfg.flee && distP < WILDLIFE.fleeRange) {
        away = toPlayer.clone().multiplyScalar(-1).normalize();
      }
      for (const t of threats) {
        const dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > WILDLIFE.rhinoFleeRange || d < 1e-3) continue;
        const v = new THREE.Vector3(dx / d, 0, dz / d);
        away = away ? away.add(v).normalize() : v;
      }
      if (away) {
        want = away;
        speed = cfg.speed;
      } else {
        this.wanderFor -= dt;
        const toT = this.target.clone().sub(this.pos).setY(0);
        // Re-pick on arrival or when bored - and steer at the new target the
        // same frame. Dropping steering for a frame let the velocity decay
        // and made the animal hesitate every time it chose somewhere to go.
        if (this.wanderFor <= 0 || toT.length() < 4) {
          this._newWanderTarget();
          toT.copy(this.target).sub(this.pos).setY(0);
        }
        if (toT.lengthSq() > 1e-4) want = toT.normalize();
      }
    }

    // Steering goes through a filtered heading rather than the raw wish. The
    // raw one flips about: a target is reached, a threat moves, world.resolve
    // shoves the body off course - and each flip used to reach the yaw as a
    // snap. The heading eases, and the yaw is then limited to a real turn
    // rate in radians per second, so nothing can ever pivot in one frame.
    if (want) {
      this.heading.lerp(want, Math.min(1, dt * 3.5));
      if (this.heading.lengthSq() < 1e-4) this.heading.copy(want);
      this.heading.normalize();
      this.vel.x += (want.x * speed - this.vel.x) * Math.min(1, dt * 5);
      this.vel.z += (want.z * speed - this.vel.z) * Math.min(1, dt * 5);
      const d = wrapPi(Math.atan2(this.heading.x, this.heading.z) - this.yaw);
      const step = d * Math.min(1, dt * 7);
      const cap = (cfg.turn || 3.4) * dt;
      this.yaw += Math.max(-cap, Math.min(cap, step));
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
    }
    const wasX = this.pos.x, wasZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ground animals bump into scenery; flyers are above all of it
    if (!cfg.fly) {
      world.resolve(this.pos, this.radius);
      // Grinding into a tree: the body barely moves while the steering keeps
      // aiming through it, and world.resolve pushes back every frame. Give up
      // and go somewhere else instead of shuddering against it.
      const moved = Math.hypot(this.pos.x - wasX, this.pos.z - wasZ);
      const trying = Math.hypot(this.vel.x, this.vel.z) * dt;
      this.stuck = (trying > 0.02 && moved < trying * 0.3) ? this.stuck + dt : 0;
      if (this.stuck > 0.8 && !this.angry) { this._newWanderTarget(); this.stuck = 0; }
    } else {
      const rr = Math.hypot(this.pos.x, this.pos.z);
      const lim = WORLD.radius - 4;
      if (rr > lim) { this.pos.x *= lim / rr; this.pos.z *= lim / rr; }
      // an angry bird climbs or drops to the player's own altitude
      const wanted = this.angry
        ? Math.min(cfg.fly.cruise[1] + 8, Math.max(cfg.fly.dive, (player.y || 0) + 1.2))
        : this._cruise();
      this.height += (wanted - this.height) * Math.min(1, dt * 1.6);
    }

    this._animate(dt);
    return damage;
  }

  _cruise() {
    const [lo, hi] = this.cfg.fly.cruise;
    return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(this.phase * 0.35));
  }

  _animate(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const cfg = this.cfg;
    const g = this.root;
    g.position.set(this.pos.x, this.height, this.pos.z);
    g.rotation.set(0, this.yaw, 0);

    const ease = Math.min(1, dt * 5);
    // Animation amplitudes follow a smoothed speed. The raw one twitches
    // every frame as the steering and the world push the body around, and a
    // twitching amplitude looks exactly like a twitching animal.
    this.animSpeed += (speed - this.animSpeed) * Math.min(1, dt * 4);
    const sp = this.animSpeed;
    this.gait += dt * (4 + sp * 0.5);
    const bob = Math.sin(this.gait);
    // Two footfalls per stride without the cusp of Math.abs(sin), whose
    // derivative flips sign at every bounce - that kink is what read as a
    // shake once it reached the head.
    const hop = 0.5 - 0.5 * Math.cos(this.gait * 2);

    if (cfg.fly) {
      // The beat speeds up when it is cross, but the rate eases in rather
      // than snapping. 1.75 Hz of full-amplitude sine read as a buzz, so the
      // beat is slower and skewed - a quick downstroke, a slower recovery -
      // which is both what a bird does and much easier for the eye to track.
      this.flapRate += ((this.angry ? 11 : 7) - this.flapRate) * ease;
      this.wingPhase += dt * this.flapRate;
      const flap = Math.sin(this.wingPhase + 0.38 * Math.sin(this.wingPhase));
      for (let i = 0; i < this.parts.wings.length; i++) {
        this.parts.wings[i].rotation.z = (i ? -1 : 1) * (flap * 0.78 + 0.1);
      }
      this.hopY = 0;
      // the body rises on the downstroke instead of bobbing at walking pace:
      // a flyer has no gait, and the gait rate was jittering it vertically
      g.position.y += Math.sin(this.wingPhase - 0.7) * 0.16;
      const wantPitch = -Math.min(speed, 16) * 0.012 - (this.angry ? 0.18 : 0);
      this.pitch += (wantPitch - this.pitch) * ease;
      g.rotation.x = this.pitch;
    } else {
      this.hopY = hop * Math.min(0.22, sp * 0.035);
      g.position.y = this.hopY;
      const swing = Math.min(0.9, 0.12 + sp * 0.09);
      for (let i = 0; i < this.parts.legs.length; i++) {
        const s = Math.sin(this.gait * 1.25 + i * Math.PI * (this.parts.legs.length > 2 ? 0.5 : 1));
        this.parts.legs[i].rotation.x = s * swing;
      }
      for (const w of this.parts.wings) w.rotation.x = bob * Math.min(0.5, sp * 0.05);
    }

    // Head: a walking bird holds its head almost still and lets the body
    // move under it, so most of the body's bounce is cancelled here rather
    // than added to. It thrusts forward on a peck and pulls in on a tuck.
    const head = this.parts.head;
    if (head) {
      const base = head.userData.baseZ ?? (head.userData.baseZ = head.position.z);
      const baseY = head.userData.baseY ?? (head.userData.baseY = head.position.y);
      // Applied straight, not eased: everything feeding it is already smooth,
      // and a lag here would filter out the very counter-bob that steadies
      // the head. hopY is world units, the head lives inside a scaled group.
      head.position.z = base + this.lunge * 0.55 - this.tuck * 0.7;
      head.position.y = baseY - (this.hopY || 0) * 0.72 / (cfg.scale || 1) - this.tuck * 0.25;
      head.rotation.x = this.lunge * 0.5 - (this.hopY || 0) * 0.5;
    }
    for (const leg of this.parts.legs) leg.visible = this.tuck < 0.4;

    const f = this.flash;
    if (f > 0 || this._lit) {
      for (const m of this.parts.mats) m.emissive?.setRGB(f * 0.7, f * 0.15, 0);
      this._lit = f > 0;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.parts.mats) m.dispose();
  }
}

// --------------------------------------------------------------- manager --

export class Wildlife {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.critters = [];
    this._byKind = {};
    // A phone draws these too, so thin the population on the lower presets.
    const share = quality === 'low' ? 0.6 : quality === 'medium' ? 0.8 : 1;
    const total = Math.max(4, Math.round(WILDLIFE.total * share));

    const add = (kind) => {
      this._byKind[kind] = (this._byKind[kind] || 0) + 1;
      this.critters.push(new Critter(scene, kind));
    };
    // Seed the guaranteed few first: a weighted roll alone can leave a whole
    // species missing for a run, and the birds are the ones you notice.
    for (const [kind, cfg] of Object.entries(WILDLIFE.kinds)) {
      for (let i = 0; i < (cfg.min || 0) && this.critters.length < total; i++) add(kind);
    }
    while (this.critters.length < total) {
      const kind = this._rollKind();
      if (!kind) break;
      add(kind);
    }
  }

  /** Weighted pick, respecting each species' cap. */
  _rollKind() {
    const options = Object.entries(WILDLIFE.kinds)
      .filter(([k, cfg]) => (this._byKind[k] || 0) < cfg.max);
    if (!options.length) return null;
    const total = options.reduce((a, [, cfg]) => a + cfg.weight, 0);
    let r = Math.random() * total;
    for (const [k, cfg] of options) { r -= cfg.weight; if (r <= 0) return k; }
    return options[0][0];
  }

  /** Somewhere in the arena that is not right on top of the player. */
  _spot(playerPos) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU;
      const r = 18 + Math.sqrt(Math.random()) * (WORLD.radius - 22);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > WILDLIFE.minSpawnDist) {
        return new THREE.Vector3(x, 0, z);
      }
    }
    return new THREE.Vector3(Math.cos(Math.random() * TAU) * 90, 0, Math.sin(Math.random() * TAU) * 90);
  }

  /** Put everybody back on the field — called when a run starts. */
  reset(playerPos) {
    for (const c of this.critters) {
      c.respawnIn = 0;
      c.place(this._spot(playerPos));
    }
  }

  alive() { return this.critters.filter((c) => c.alive); }

  /** Total damage the wildlife did to the player this frame. */
  update(dt, player, world, threats, canHarm) {
    let dmg = 0;
    for (const c of this.critters) {
      if (!c.alive && c.dying <= 0) {
        c.respawnIn -= dt;
        if (c.respawnIn <= 0) c.place(this._spot(player.pos));
        continue;
      }
      dmg += c.update(dt, player, world, threats, canHarm);
    }
    return dmg;
  }

  dispose() {
    for (const c of this.critters) c.dispose();
    this.critters.length = 0;
  }
}
