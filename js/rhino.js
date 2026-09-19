// Enemy rhinos: procedural model, charge-based AI, health bars.
import * as THREE from 'three';
import { RHINO, WORLD, SCENERY } from './config.js';
import { makeProfile, tubeAlongZ, ellipsoid, capsule, cone, skinMaterial } from './geom.js';

const BODY_Y = 1.95;        // height of the torso pivot above the ground

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function mat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }
function box(w, h, d, color, flat = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { flatShading: flat }));
  m.castShadow = true;
  return m;
}

export class Rhino {
  constructor(scene, variantKey, spawn) {
    const v = { ...RHINO.base, ...RHINO.variants[variantKey] };
    this.scene = scene;
    this.variant = variantKey;
    this.cfg = v;
    this.maxHp = v.hp;
    this.hp = v.hp;
    this.armor = v.armor || 0;
    this.scaleF = v.scale;
    this.radius = 2.2 * v.scale;
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'chase';
    this.stateT = 0;
    this.phase = Math.random() * 10;
    this.burn = 0;            // seconds of burning left
    this.burnDps = 0;
    this.stun = 0;
    this.attackCd = 0;
    this.chargeDir = new THREE.Vector3();
    this.hitThisCharge = false;
    this.alive = true;
    this.dying = 0;
    this.flash = 0;
    this.dead = false;        // fully removed
    this.remote = false;      // replicated from the host, no local AI
    this.net = { x: spawn.x, z: spawn.z, yaw: 0 };
    this._build();
  }

  _build() {
    const v = this.cfg;
    const root = new THREE.Group();
    root.scale.setScalar(v.scale);
    root.position.copy(this.pos);
    this.scene.add(root);
    this.root = root;

    const body = new THREE.Group();
    body.position.y = BODY_Y;
    root.add(body);
    this.body = body;

    const hide = v.color;
    const dark = new THREE.Color(hide).multiplyScalar(0.74).getHex();
    const bellyHex = new THREE.Color(hide).lerp(new THREE.Color(0xffffff), 0.3).getHex();
    const mats = this.mats = {
      hide: skinMaterial(hide, { shininess: 10 }),
      dark: skinMaterial(dark, { shininess: 8 }),
      horn: skinMaterial(0xf3e7d0, { shininess: 36 }),
      hoof: skinMaterial(0x4d433a, { shininess: 6 }),
      eye: new THREE.MeshPhongMaterial({ color: 0x1d1510, shininess: 60 }),
      body: skinMaterial(0xffffff, { vertexColors: true, shininess: 10 }),
    };

    // ---- barrel torso ----------------------------------------------------
    const radius = makeProfile([
      { z: -2.9, v: 0.12 }, { z: -2.6, v: 0.58 }, { z: -2.1, v: 0.92 },
      { z: -1.2, v: 1.14 }, { z: -0.3, v: 1.22 }, { z: 0.55, v: 1.24 },
      { z: 1.3, v: 1.16 }, { z: 2.0, v: 0.96 }, { z: 2.5, v: 0.74 },
    ]);
    const centerY = makeProfile([
      { z: -2.9, v: 0.3 }, { z: -1.4, v: 0.05 }, { z: 0.2, v: 0 },
      { z: 1.0, v: 0.12 }, { z: 1.8, v: 0.05 }, { z: 2.5, v: -0.12 },
    ]);
    const cHide = new THREE.Color(hide);
    const cBelly = new THREE.Color(bellyHex);
    const torso = new THREE.Mesh(tubeAlongZ({
      zStart: -2.9, zEnd: 2.5, rings: 56, radial: 20,
      radius, center: centerY,
      squash: (z) => ({ x: 0.86, y: z > 0.4 ? 1.06 : 1.0 }),
      color: (z, a, out) => {
        out.copy(cHide);
        out.lerp(cBelly, THREE.MathUtils.smoothstep(-Math.sin(a), 0.3, 0.9));
      },
    }), mats.body);
    torso.castShadow = true;
    torso.receiveShadow = true;
    body.add(torso);

    // armour bands on the tougher hides
    if (this.armor > 0) {
      for (let i = 0; i < 3; i++) {
        const z = 0.9 - i * 0.95;
        const band = new THREE.Mesh(new THREE.TorusGeometry(radius(z) * 0.99, 0.13, 10, 28), mats.dark);
        band.rotation.y = Math.PI / 2;
        band.rotation.x = Math.PI / 2;
        band.position.set(0, centerY(z), z);
        band.scale.set(1, 1, 0.94);
        band.castShadow = true;
        body.add(band);
      }
    }
    if (v.boss) {
      for (const sx of [-1, 1]) {
        const spike = cone(0.24, 1.05, mats.horn, 10);
        spike.position.set(sx * 0.7, centerY(0.2) + radius(0.2) * 0.86, 0.2);
        spike.rotation.z = sx * 0.3;
        body.add(spike);
      }
    }

    // ---- head -------------------------------------------------------------
    const neck = new THREE.Group();
    neck.position.set(0, 0.2, 1.85);
    body.add(neck);
    this.neck = neck;
    const head = new THREE.Group();
    head.scale.setScalar(1.18);
    head.position.set(0, -0.52, 0.72);
    neck.add(head);
    this.head = head;

    const skull = ellipsoid(0.82, 0.78, 0.92, mats.hide, 20);
    skull.position.set(0, 0.08, 0.05);
    head.add(skull);
    const jowl = ellipsoid(0.74, 0.62, 0.55, mats.hide, 18);
    jowl.position.set(0, -0.16, 0.75);
    head.add(jowl);
    const snout = ellipsoid(0.6, 0.52, 0.66, mats.hide, 18);
    snout.position.set(0, -0.22, 1.42);
    head.add(snout);
    const lip = ellipsoid(0.44, 0.24, 0.26, mats.dark, 14);
    lip.position.set(0, -0.54, 1.78);
    head.add(lip);

    const horn = cone(0.34, 1.65 * (v.boss ? 1.45 : 1), mats.horn, 14);
    horn.position.set(0, 0.36, 1.62);
    horn.rotation.x = 0.55;
    head.add(horn);
    this.horn = horn;
    const horn2 = cone(0.21, 0.62, mats.horn, 12);
    horn2.position.set(0, 0.62, 0.78);
    horn2.rotation.x = 0.3;
    head.add(horn2);

    for (const sx of [-1, 1]) {
      const ear = ellipsoid(0.1, 0.24, 0.16, mats.dark, 12);
      ear.position.set(sx * 0.5, 0.74, -0.32);
      ear.rotation.z = sx * 0.35;
      head.add(ear);
      const eye = ellipsoid(0.13, 0.13, 0.13, mats.eye, 12);
      eye.position.set(sx * 0.72, 0.2, 0.55);
      head.add(eye);
      const nostril = ellipsoid(0.07, 0.06, 0.06, mats.eye, 10);
      nostril.position.set(sx * 0.19, -0.2, 2.0);
      head.add(nostril);
    }

    // ---- legs ---------------------------------------------------------------
    this.legs = [];
    const legPos = [[-0.8, 1.25], [0.8, 1.25], [-0.86, -1.35], [0.86, -1.35]];
    legPos.forEach(([x, z], i) => {
      const hip = new THREE.Group();
      hip.position.set(x, -0.62, z);
      body.add(hip);
      const shoulder = ellipsoid(0.48, 0.54, 0.56, mats.hide, 14);
      shoulder.position.y = -0.08;
      hip.add(shoulder);
      const upper = capsule(0.38, 0.32, mats.hide, 12);
      upper.position.y = -0.44;
      hip.add(upper);

      const knee = new THREE.Group();
      knee.position.y = -0.78;
      hip.add(knee);
      const lower = capsule(0.33, 0.3, mats.hide, 12);
      lower.position.y = -0.28;
      knee.add(lower);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.34, 0.26, 16), mats.hoof);
      hoof.position.y = -0.62;
      hoof.castShadow = true;
      knee.add(hoof);
      this.legs.push({ hip, knee, i, front: z > 0 });
    });

    // ---- tail ----------------------------------------------------------------
    const tail = new THREE.Group();
    tail.position.set(0, 0.55, -2.65);
    body.add(tail);
    const tailM = capsule(0.11, 1.0, mats.dark, 10);
    tailM.rotation.x = Math.PI / 2;
    tailM.position.z = -0.6;
    tail.add(tailM);
    const tuft = ellipsoid(0.2, 0.2, 0.26, mats.dark, 12);
    tuft.position.z = -1.25;
    tail.add(tuft);
    this.tail = tail;

    // ---- health bar -----------------------------------------------------------
    const bar = new THREE.Group();
    bar.position.y = 4.4 * (this.cfg.boss ? 1.2 : 1);
    root.add(bar);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x2b1f16, transparent: true, opacity: 0.55, depthTest: false })
    );
    bg.renderOrder = 10;
    bar.add(bg);
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(2.84, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x64e06a, depthTest: false })
    );
    fill.position.z = 0.01;
    fill.renderOrder = 11;
    bar.add(fill);
    this.bar = bar;
    this.barFill = fill;
    this.barBg = bg;

    this.frontAnchor = new THREE.Object3D();
    this.frontAnchor.position.set(0, -1.55, 2.1);
    body.add(this.frontAnchor);

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 22),
      new THREE.MeshBasicMaterial({ color: 0x2c4a1e, transparent: true, opacity: 0.2, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.04;
    root.add(blob);
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return 0;
    const mult = opts.ignoreArmor ? 1 : (1 - this.armor);
    const vulnerable = this.state === 'stun' || this.state === 'recover';
    const dmg = amount * mult * (vulnerable ? 1.65 : 1);
    this.hp -= dmg;
    this.flash = 1;
    if (opts.knock) {
      this.vel.addScaledVector(opts.knock, (opts.knockStrength || 10) / Math.max(this.scaleF, 0.6));
    }
    if (opts.stun) this.setState('stun', Math.max(this.stun, opts.stun));
    if (opts.burn) { this.burn = Math.max(this.burn, opts.burn.time); this.burnDps = Math.max(this.burnDps, opts.burn.dps); }
    if (this.hp <= 0) { this.alive = false; this.dying = 0.0001; }
    return dmg;
  }

  setState(s, t = 0) {
    this.state = s;
    this.stateT = 0;
    if (s === 'stun') this.stun = t || RHINO.crashStun;
  }

  /** Guests do not simulate rhinos; they just follow the host's snapshots. */
  updateRemote(dt) {
    if (this.dead) return;
    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (!this.alive) return this._updateDying(dt);
    const before = tmp2.copy(this.pos);
    const k = 1 - Math.exp(-12 * dt);
    this.pos.x += (this.net.x - this.pos.x) * k;
    this.pos.z += (this.net.z - this.pos.z) * k;
    let d = this.net.yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k;
    this._animate(dt, before);
  }

  update(dt, rex, world, others, fx) {
    if (this.dead) return;
    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 4);

    if (!this.alive) return this._updateDying(dt);

    // burning damage over time
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= this.burnDps * dt * (1 - this.armor * 0.5);
      if (Math.random() < dt * 14) fx?.ember(this.pos.clone().setY(2.2 * this.scaleF + Math.random() * 2));
      if (this.hp <= 0) { this.alive = false; this.dying = 0.0001; return; }
    }

    this.stateT += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);

    const toRex = tmp.copy(rex.pos).sub(this.pos).setY(0);
    const dist = toRex.length();
    const dir = dist > 0.001 ? toRex.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);

    let desiredSpeed = 0;
    let steer = null;
    let turnRate = 2.6;

    switch (this.state) {
      case 'chase': {
        if (!rex.alive) { this.setState('idle'); break; }
        steer = dir;
        desiredSpeed = this.cfg.speed;
        turnRate = 2.8;
        if (dist < RHINO.chargeTrigger && dist > 8 && this.attackCd <= 0 && this._facing(dir, 0.55)) {
          this.setState('windup');
        } else if (dist < 6.2 && this.attackCd <= 0) {
          this.setState('gore');
        }
        break;
      }
      case 'windup': {
        steer = dir;
        desiredSpeed = 0.6;
        turnRate = 3.4;
        if (Math.random() < dt * 22) fx?.dust(this._frontPoint(), 0.5 * this.scaleF);
        if (this.stateT >= RHINO.chargeWindup) {
          this.chargeDir.copy(dir);
          this.hitThisCharge = false;
          this.setState('charge');
          fx?.dustBurst(this._frontPoint(), 9, this.scaleF);
        }
        break;
      }
      case 'charge': {
        steer = this.chargeDir;
        desiredSpeed = this.cfg.chargeSpeed;
        turnRate = 1.1;                      // committed: only a slight course correction
        this.chargeDir.lerp(dir, Math.min(1, dt * 0.55)).setY(0).normalize();
        if (Math.random() < dt * 30) fx?.dust(this._frontPoint(), 0.7 * this.scaleF);
        // hit the rex?
        if (!this.hitThisCharge && dist < this.radius + 2.6) {
          this.hitThisCharge = true;
          const dealt = rex.damage(this.cfg.chargeDamage, dir);
          if (dealt) {
            fx?.impact(rex.pos.clone().setY(2.4), 0xff5a3c);
            fx?.shake(0.9);
          }
          this.setState('recover');
        }
        if (this.stateT > RHINO.chargeTime) this.setState('recover');
        break;
      }
      case 'recover': {
        desiredSpeed = 0;
        turnRate = 1.6;
        if (this.stateT > RHINO.chargeRecover) { this.attackCd = RHINO.attackCooldown; this.setState('chase'); }
        break;
      }
      case 'gore': {
        steer = dir;
        desiredSpeed = 1.5;
        if (this.stateT > 0.35 && !this.hitThisCharge) {
          this.hitThisCharge = true;
          if (dist < 7.5 && this._facing(dir, 0.55)) {
            if (rex.damage(this.cfg.damage, dir)) { fx?.impact(rex.pos.clone().setY(2.6), 0xffa03c); fx?.shake(0.45); }
          }
        }
        if (this.stateT > 0.8) { this.hitThisCharge = false; this.attackCd = RHINO.attackCooldown; this.setState('chase'); }
        break;
      }
      case 'stun': {
        desiredSpeed = 0;
        this.stun -= dt;
        if (this.stun <= 0) { this.attackCd = 0.5; this.setState('chase'); }
        break;
      }
      default: {
        desiredSpeed = 0;
        if (this.stateT > 1.5) this.setState('chase');
      }
    }

    // ---- steering + physics ---------------------------------------------
    if (steer && this.state !== 'stun') {
      const want = Math.atan2(steer.x, steer.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += THREE.MathUtils.clamp(d, -turnRate * dt, turnRate * dt);
    }

    const fwd = this.forward;
    const target = fwd.multiplyScalar(desiredSpeed);
    const accel = this.state === 'charge' ? 26 : 12;
    this.vel.x += THREE.MathUtils.clamp(target.x - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += THREE.MathUtils.clamp(target.z - this.vel.z, -accel * dt, accel * dt);

    // separation so the herd does not stack into one rhino
    if (others) {
      for (const o of others) {
        if (o === this || !o.alive) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = RHINO.separation * (this.scaleF + o.scaleF) * 0.5;
        if (d2 < min * min && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const push = (min - d) / min * 14 * dt;
          this.vel.x += (dx / d) * push;
          this.vel.z += (dz / d) * push;
        }
      }
    }

    const before = tmp2.copy(this.pos);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // never overlap the rex — push out to the edge of its body
    if (rex.alive) {
      const dx = this.pos.x - rex.pos.x, dz = this.pos.z - rex.pos.z;
      const min = this.radius + 2.6;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        this.pos.x = rex.pos.x + (dx / d) * min;
        this.pos.z = rex.pos.z + (dz / d) * min;
      }
    }
    const hit = world.resolve(this.pos, this.radius);
    if (hit && this.state === 'charge') {
      // slamming into a tree / rock / the fence hurts and stuns it
      this.takeDamage(this.maxHp * 0.12, { ignoreArmor: true });
      this.vel.multiplyScalar(-0.25);
      fx?.dustBurst(this.pos.clone().setY(1.5), 16, this.scaleF * 1.4);
      fx?.shake(0.5);
      world.damage(hit, SCENERY.smashDamage * this.scaleF, 'smash', fx);
      this.setState('stun', RHINO.crashStun);
    }
    const damp = Math.max(0, 1 - (this.state === 'charge' ? 0.6 : 5.0) * dt);
    this.vel.x *= damp; this.vel.z *= damp;

    this._animate(dt, before);
  }

  _facing(dir, minDot) {
    return this.forward.dot(dir) > minDot;
  }

  _frontPoint() {
    this.frontAnchor.updateWorldMatrix(true, false);
    return this.frontAnchor.getWorldPosition(new THREE.Vector3()).setY(0.2);
  }

  _updateDying(dt) {
    this.dying += dt;
    const u = Math.min(this.dying / 1.1, 1);
    this.body.rotation.z = u * 1.5;
    this.body.position.y = BODY_Y - u * 1.0;
    this.root.scale.setScalar(this.scaleF * (1 - u * 0.12));
    this.bar.visible = false;
    if (u >= 1) {
      const a = Math.max(0, 1 - (this.dying - 1.1) * 1.6);
      for (const k in this.mats) { this.mats[k].transparent = true; this.mats[k].opacity = a; }
      if (this.dying > 1.8) this.dispose();
    }
  }

  _animate(dt, before) {
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    const gait = this.state === 'charge' ? 14 : 7;
    const stride = THREE.MathUtils.clamp(moved / this.cfg.speed, 0, 2.2);
    const p = this.phase * gait;

    for (const leg of this.legs) {
      const off = (leg.i % 2 ? 0 : Math.PI) + (leg.front ? 0.5 : 0);
      leg.hip.rotation.x = Math.sin(p + off) * 0.55 * stride;
      leg.knee.rotation.x = Math.max(0, Math.sin(p + off + 1.0)) * 0.6 * stride;
    }

    let bodyPitch = -stride * 0.05;
    let headPitch = 0;
    if (this.state === 'windup') {
      headPitch = 0.45 + Math.sin(this.stateT * 26) * 0.12;
      bodyPitch = 0.1;
      // paw the ground with a front hoof
      this.legs[0].hip.rotation.x = Math.sin(this.stateT * 16) * 0.8;
    } else if (this.state === 'charge') {
      headPitch = 0.28;
      bodyPitch = -0.16;
    } else if (this.state === 'stun') {
      headPitch = -0.3 + Math.sin(this.phase * 8) * 0.08;
      this.body.rotation.z = Math.sin(this.phase * 5) * 0.12;
    } else if (this.state === 'gore') {
      headPitch = -0.6 * Math.sin(Math.min(this.stateT / 0.45, 1) * Math.PI);
    }
    if (this.state !== 'stun') this.body.rotation.z = Math.sin(p * 0.5) * 0.05 * stride;
    this.body.rotation.x = bodyPitch + Math.sin(p) * 0.02 * stride;
    this.body.position.y = BODY_Y + Math.abs(Math.sin(p)) * 0.07 * stride;
    this.neck.rotation.x = headPitch;
    this.tail.rotation.y = Math.sin(this.phase * 5) * 0.4;
    this.tail.rotation.x = -0.3 + Math.sin(this.phase * 3) * 0.1;

    // health bar
    const frac = THREE.MathUtils.clamp(this.hp / this.maxHp, 0, 1);
    this.barFill.scale.x = Math.max(frac, 0.001);
    this.barFill.position.x = -(1 - frac) * 1.42;
    this.barFill.material.color.setHSL(0.33 * frac, 0.75, 0.52);
    this.bar.visible = frac < 0.999 || this.cfg.boss === true;

    // hit flash / burning glow
    const f = this.flash;
    if (f > 0 || this.burn > 0 || this._wasFlash) {
      const r = this.burn > 0 ? 0.16 + f * 0.3 : f * 0.7;
      const g = this.burn > 0 ? 0.07 + f * 0.13 : f * 0.3;
      for (const k in this.mats) this.mats[k].emissive?.setRGB(r, g, 0);
      this._wasFlash = f > 0 || this.burn > 0;
    }
  }

  faceBar(camQuat) {
    if (this.bar.visible) this.bar.quaternion.copy(camQuat).premultiply(this._invRoot());
  }

  _invRoot() {
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const k in this.mats) this.mats[k].dispose?.();
  }
}

export function spawnRing(count, rexPos) {
  // Spawn points ringing the arena, away from the player.
  const pts = [];
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    let a = base + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const r = WORLD.radius * (0.72 + Math.random() * 0.2);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (p.distanceTo(rexPos) < 40) {
      p.multiplyScalar(-1);
    }
    pts.push(p);
  }
  return pts;
}
