// The player: a procedurally modelled, hand-animated T-Rex.
import * as THREE from 'three';
import { REX, ATTACK, WORLD, COLORS } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat(color, opts));
  m.castShadow = true;
  return m;
}

export class Rex {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 18);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;             // facing -z initially
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.hp = REX.maxHp;
    this.fire = REX.maxFire;
    this.lastHit = -99;
    this.invuln = 0;
    this.phase = 0;                 // walk cycle phase
    this.speed = 0;
    this.attack = null;             // { type, t, dur, hitDone }
    this.cooldown = { bite: 0, tail: 0 };
    this.breathing = false;
    this.roar = 0;
    this.hurtFlash = 0;
    this.alive = true;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this._build();
  }

  _build() {
    const root = new THREE.Group();
    this.root = root;
    this.scene.add(root);

    // body pivots around the hips so the tail + torso can lean as one
    const body = new THREE.Group();
    body.position.y = 2.55;
    root.add(body);
    this.body = body;

    const skin = COLORS.rexBody, belly = COLORS.rexBelly, stripe = COLORS.rexStripe;

    // ---- torso ----------------------------------------------------------
    const torso = box(2.5, 2.3, 4.6, skin, { flatShading: true });
    torso.position.set(0, 0, -0.2);
    body.add(torso);
    const chest = box(2.2, 1.9, 1.9, skin, { flatShading: true });
    chest.position.set(0, 0.15, 2.0);
    body.add(chest);
    const bellyM = box(1.7, 1.0, 4.2, belly);
    bellyM.position.set(0, -1.0, 0.1);
    body.add(bellyM);
    for (let i = 0; i < 3; i++) {
      const s = box(2.58, 0.42, 0.62, stripe);
      s.position.set(0, 1.02 - i * 0.04, -1.2 + i * 1.25);
      body.add(s);
    }

    // ---- neck + head ----------------------------------------------------
    const neck = new THREE.Group();
    neck.position.set(0, 0.85, 2.5);
    body.add(neck);
    this.neck = neck;
    const neckM = box(1.35, 1.35, 2.0, skin, { flatShading: true });
    neckM.position.set(0, 0.35, 0.75);
    neckM.rotation.x = -0.25;
    neck.add(neckM);

    const head = new THREE.Group();
    head.position.set(0, 0.95, 1.85);
    neck.add(head);
    this.head = head;

    const skull = box(1.35, 1.25, 2.5, skin, { flatShading: true });
    skull.position.set(0, 0.2, 0.75);
    head.add(skull);
    const snout = box(1.0, 0.75, 1.1, skin, { flatShading: true });
    snout.position.set(0, 0.05, 2.15);
    head.add(snout);
    const brow = box(1.45, 0.3, 0.9, stripe);
    brow.position.set(0, 0.82, 1.0);
    head.add(brow);

    for (const sx of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), mat(0xfffdf5));
      eyeW.position.set(sx * 0.6, 0.55, 1.35);
      head.add(eyeW);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20140c }));
      pupil.position.set(sx * 0.68, 0.55, 1.55);
      head.add(pupil);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: 0x8c3a12 }));
      nostril.position.set(sx * 0.22, 0.28, 2.66);
      head.add(nostril);
    }

    // upper teeth
    const teethMat = mat(0xfffdf0);
    for (let i = 0; i < 6; i++) {
      for (const sx of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), teethMat);
        t.position.set(sx * 0.5, -0.34, 0.35 + i * 0.4);
        t.rotation.x = Math.PI;
        head.add(t);
      }
    }

    // jaw (rotates open)
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.38, 0.1);
    head.add(jaw);
    this.jaw = jaw;
    const jawM = box(1.1, 0.42, 2.45, skin, { flatShading: true });
    jawM.position.set(0, -0.12, 1.25);
    jaw.add(jawM);
    const tongue = box(0.6, 0.12, 1.6, 0xf07a8f);
    tongue.position.set(0, 0.12, 1.3);
    jaw.add(tongue);
    for (let i = 0; i < 6; i++) {
      for (const sx of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), teethMat);
        t.position.set(sx * 0.46, 0.2, 0.4 + i * 0.4);
        jaw.add(t);
      }
    }
    // point where flames come out
    this.mouthAnchor = new THREE.Object3D();
    this.mouthAnchor.position.set(0, -0.05, 3.0);
    head.add(this.mouthAnchor);

    // ---- arms -----------------------------------------------------------
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 1.1, 0.1, 1.5);
      body.add(arm);
      const upper = box(0.34, 0.9, 0.34, skin);
      upper.position.y = -0.45;
      arm.add(upper);
      const fore = box(0.3, 0.7, 0.3, skin);
      fore.position.set(0, -1.15, 0.25);
      arm.add(fore);
      for (let c = 0; c < 2; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), teethMat);
        claw.position.set(-0.08 + c * 0.16, -1.55, 0.4);
        claw.rotation.x = 1.3;
        arm.add(claw);
      }
      arm.rotation.x = 0.5;
      this.arms.push(arm);
    }

    // ---- legs -----------------------------------------------------------
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.95, -0.55, -0.35);
      body.add(hip);
      const thigh = box(1.05, 1.7, 1.5, skin, { flatShading: true });
      thigh.position.y = -0.75;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -1.55;
      hip.add(knee);
      const shin = box(0.55, 1.5, 0.6, skin);
      shin.position.set(0, -0.7, -0.12);
      knee.add(shin);
      const ankle = new THREE.Group();
      ankle.position.set(0, -1.45, 0);
      knee.add(ankle);
      const foot = box(0.8, 0.4, 1.5, skin);
      foot.position.set(0, -0.15, 0.35);
      ankle.add(foot);
      for (let c = 0; c < 3; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 4), teethMat);
        claw.position.set(-0.26 + c * 0.26, -0.22, 1.12);
        claw.rotation.x = 1.55;
        ankle.add(claw);
      }
      this.legs.push({ hip, knee, ankle, sx });
    }

    // ---- tail -----------------------------------------------------------
    this.tail = [];
    let parent = body;
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.25 : 0, i === 0 ? -2.1 : -0.92);
      parent.add(seg);
      const w = 1.75 - i * 0.26;
      const m = box(Math.max(w, 0.25), Math.max(w * 0.92, 0.22), 1.1, i % 2 ? skin : stripe, { flatShading: true });
      m.position.z = -0.48;
      seg.add(m);
      const fin = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(0.2 - i * 0.02, 0.06), Math.max(0.55 - i * 0.06, 0.16), 4),
        mat(stripe, { flatShading: true })
      );
      fin.position.set(0, Math.max(w * 0.46, 0.12), -0.5);
      fin.castShadow = true;
      seg.add(fin);
      this.tail.push(seg);
      parent = seg;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 5), mat(stripe, { flatShading: true }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -1.3;
    parent.add(tip);
    this.tailTip = parent;

    // dorsal ridge: a row of spines that keeps the silhouette readable from behind
    const spineMat = mat(stripe, { flatShading: true });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.34 - i * 0.03, 0.95 - i * 0.08, 4), spineMat);
      sp.position.set(0, 1.4, 1.5 - i * 1.1);
      sp.rotation.x = -0.12;
      sp.castShadow = true;
      body.add(sp);
    }

    // shadow blob under the rex for readability on the bright ground
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x2c4a1e, transparent: true, opacity: 0.22, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    root.add(blob);
    this.blob = blob;

    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    blob.castShadow = false;
    root.position.copy(this.pos);
  }

  get mouthPosition() {
    this.mouthAnchor.updateWorldMatrix(true, false);
    return this.mouthAnchor.getWorldPosition(new THREE.Vector3());
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  damage(amount, fromDir) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 0.45;
    this.lastHit = 0;
    this.hurtFlash = 1;
    this.combo = 0;
    if (fromDir) this.vel.addScaledVector(fromDir, 9);
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  heal(n) { this.hp = Math.min(REX.maxHp, this.hp + n); }

  startAttack(type) {
    if (!this.alive || this.attack) return false;
    if (this.cooldown[type] > 0) return false;
    const cfg = ATTACK[type];
    this.attack = { type, t: 0, dur: cfg.windup + cfg.active + 0.22, hitDone: false };
    this.cooldown[type] = cfg.cooldown;
    return true;
  }

  canBreathe() { return this.alive && !this.attack && this.fire > REX.fireMinToStart; }

  update(dt, input, camYaw, world) {
    for (const k in this.cooldown) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.lastHit += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.roar = Math.max(0, this.roar - dt);
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // ---- intent ---------------------------------------------------------
    const attacking = !!this.attack;
    let wish = new THREE.Vector3();
    if (this.alive) {
      const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
      const r = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
      wish.addScaledVector(f, input.move.y).addScaledVector(r, input.move.x);
      if (wish.lengthSq() > 1) wish.normalize();
    }

    const breathing = this.breathing;
    let maxSpeed = input.sprint && !breathing ? REX.sprintSpeed : REX.walkSpeed;
    if (attacking) maxSpeed *= 0.35;
    if (breathing) maxSpeed *= 0.55;
    if (!this.alive) maxSpeed = 0;

    // ---- movement -------------------------------------------------------
    const target = wish.clone().multiplyScalar(maxSpeed);
    const accel = this.grounded ? REX.accel : REX.accel * 0.35;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt / Math.max(maxSpeed, 1));
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt / Math.max(maxSpeed, 1));
    if (wish.lengthSq() < 0.001) {
      const damp = Math.max(0, 1 - REX.friction * dt);
      this.vel.x *= damp; this.vel.z *= damp;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolve(this.pos, REX.radius);

    // jump / gravity
    if (input.consume('jump') && this.grounded && this.alive) {
      this.vy = REX.jumpSpeed;
      this.grounded = false;
    }
    this.vy += WORLD.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- facing ---------------------------------------------------------
    let desiredYaw = this.yaw;
    if (breathing || attacking) desiredYaw = camYaw;                 // attacks aim where you look
    else if (wish.lengthSq() > 0.01) desiredYaw = Math.atan2(wish.x, wish.z);
    let d = desiredYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, REX.turnLerp * dt);

    // ---- attack timeline ------------------------------------------------
    let hitEvent = null;
    if (this.attack) {
      const a = this.attack;
      const cfg = ATTACK[a.type];
      a.t += dt;
      if (!a.hitDone && a.t >= cfg.windup) { a.hitDone = true; hitEvent = a.type; }
      if (a.t >= a.dur) this.attack = null;
    }

    // ---- fire meter -----------------------------------------------------
    if (breathing) {
      this.fire = Math.max(0, this.fire - REX.fireCost * dt);
      if (this.fire <= 0) this.breathing = false;
    } else {
      this.fire = Math.min(REX.maxFire, this.fire + REX.fireRegen * dt);
    }

    // ---- regen ----------------------------------------------------------
    if (this.alive && this.lastHit > REX.regenDelay) this.heal(REX.hpRegen * dt);

    this._animate(dt);
    return hitEvent;
  }

  _animate(dt) {
    const root = this.root, body = this.body;
    root.position.set(this.pos.x, this.y, this.pos.z);
    root.rotation.y = this.yaw;
    this.blob.position.y = 0.03 - this.y;
    const s = Math.min(this.speed / REX.sprintSpeed, 1.4);

    // walk cycle
    this.phase += dt * (2.2 + s * 9.5);
    const p = this.phase;
    const stride = Math.min(this.speed / REX.walkSpeed, 1.35);

    if (!this.alive) {
      // topple over
      body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 1.35, dt * 3);
      body.position.y = THREE.MathUtils.lerp(body.position.y, 1.3, dt * 3);
      this.jaw.rotation.x = THREE.MathUtils.lerp(this.jaw.rotation.x, 0.5, dt * 3);
      return;
    }

    for (const leg of this.legs) {
      const off = leg.sx > 0 ? 0 : Math.PI;
      const sw = Math.sin(p + off);
      const lift = Math.max(0, Math.sin(p + off + 0.6));
      leg.hip.rotation.x = sw * 0.55 * stride + (this.grounded ? 0 : -0.5);
      leg.knee.rotation.x = -lift * 0.95 * stride - 0.12 + (this.grounded ? 0 : 0.7);
      leg.ankle.rotation.x = lift * 0.5 * stride + 0.1;
    }

    const bob = Math.sin(p * 2) * 0.09 * stride;
    body.position.y = 2.55 + bob + (this.grounded ? 0 : 0.15);
    body.rotation.x = -0.17 - stride * 0.14 + Math.sin(p * 2 + 1) * 0.02;
    body.rotation.z = Math.sin(p) * 0.05 * stride;
    body.rotation.y = Math.sin(p) * 0.06 * stride;

    // tail: travelling wave, heavier at speed
    const whip = this.attack?.type === 'tail' ? this.attack : null;
    for (let i = 0; i < this.tail.length; i++) {
      const t = this.tail[i];
      const k = i / this.tail.length;
      let ry = Math.sin(p - i * 0.55) * (0.04 + 0.055 * stride);
      let rx = Math.sin(p * 2 - i * 0.5) * 0.04 + (i === 0 ? 0.16 : 0.01);
      if (whip) {
        const cfg = ATTACK.tail;
        const u = THREE.MathUtils.clamp(whip.t / (cfg.windup + cfg.active), 0, 1);
        // wind up to one side, then snap through a wide arc
        const swing = u < 0.35
          ? THREE.MathUtils.lerp(0, -1.1, u / 0.35)
          : THREE.MathUtils.lerp(-1.1, 1.5, (u - 0.35) / 0.65);
        ry += swing * (0.10 + k * 0.22);   // per-segment: the chain compounds it
        rx -= 0.05 * k;
      }
      t.rotation.y = ry;
      t.rotation.x = rx;
      t.rotation.z = Math.sin(p - i * 0.4) * 0.05;
    }

    // arms idle
    for (let i = 0; i < this.arms.length; i++) {
      this.arms[i].rotation.x = 0.5 + Math.sin(p + i * 2) * 0.18 * stride;
      this.arms[i].rotation.z = (i ? -1 : 1) * 0.15;
    }

    // head & jaw
    let jawOpen = 0.06 + Math.sin(this.phase * 0.8) * 0.02;
    let headPitch = Math.sin(p * 2) * 0.05 * stride;
    let neckPitch = 0.06 - stride * 0.1;
    let lunge = 0;

    const bite = this.attack?.type === 'bite' ? this.attack : null;
    if (bite) {
      const cfg = ATTACK.bite;
      const u = THREE.MathUtils.clamp(bite.t / bite.dur, 0, 1);
      if (u < 0.32) { jawOpen = THREE.MathUtils.lerp(0.06, 1.05, u / 0.32); lunge = u / 0.32 * 0.5; neckPitch -= u * 0.3; }
      else if (u < 0.52) { jawOpen = THREE.MathUtils.lerp(1.05, 0.02, (u - 0.32) / 0.2); lunge = 1.0; headPitch += 0.35; }
      else { jawOpen = THREE.MathUtils.lerp(0.02, 0.06, (u - 0.52) / 0.48); lunge = THREE.MathUtils.lerp(1.0, 0, (u - 0.52) / 0.48); }
      body.rotation.x -= lunge * 0.22;
    }
    if (this.breathing) {
      jawOpen = 0.95 + Math.sin(this.phase * 18) * 0.06;
      neckPitch -= 0.12;
      body.rotation.x -= 0.05;
    }
    if (this.roar > 0) jawOpen = Math.max(jawOpen, 0.9 * this.roar);
    if (whip) body.rotation.y += Math.sin(whip.t * 9) * 0.25;

    this.jaw.rotation.x = jawOpen;
    this.neck.rotation.x = neckPitch;
    this.neck.position.z = 2.5 + lunge * 0.8;
    this.head.rotation.x = headPitch;

    // hurt flash
    if (this.hurtFlash > 0) {
      const f = this.hurtFlash;
      this.root.traverse((o) => {
        if (o.isMesh && o.material?.emissive) {
          o.material.emissive.setRGB(f * 0.6, 0, 0);
        }
      });
      this._flashed = true;
    } else if (this._flashed) {
      this.root.traverse((o) => { if (o.isMesh && o.material?.emissive) o.material.emissive.setRGB(0, 0, 0); });
      this._flashed = false;
    }
  }
}
