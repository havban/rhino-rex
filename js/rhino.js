// Enemy rhinos: procedural model, charge-based AI, health bars.
import * as THREE from 'three';
import { RHINO, WORLD } from './config.js';

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
    body.position.y = 2.1;
    root.add(body);
    this.body = body;

    const hide = v.color;
    const dark = new THREE.Color(hide).multiplyScalar(0.78).getHex();
    const belly = new THREE.Color(hide).lerp(new THREE.Color(0xffffff), 0.28).getHex();

    const torso = box(2.4, 2.1, 4.0, hide);
    body.add(torso);
    const rump = box(2.5, 2.2, 1.4, hide);
    rump.position.set(0, 0.1, -1.9);
    body.add(rump);
    const bellyM = box(2.0, 0.8, 3.6, belly);
    bellyM.position.y = -1.0;
    body.add(bellyM);

    // armour plates on the tougher variants
    if (this.armor > 0) {
      for (let i = 0; i < 3; i++) {
        const plate = box(2.62, 0.8, 0.9, dark);
        plate.position.set(0, 0.55, 1.2 - i * 1.3);
        body.add(plate);
      }
    }
    if (v.boss) {
      for (const sx of [-1, 1]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 5), mat(0x54452f, { flatShading: true }));
        spike.position.set(sx * 0.8, 1.4, -0.4);
        body.add(spike);
      }
    }

    // ---- head -----------------------------------------------------------
    const neck = new THREE.Group();
    neck.position.set(0, 0.1, 2.0);
    body.add(neck);
    this.neck = neck;
    const head = new THREE.Group();
    head.position.set(0, -0.15, 1.1);
    neck.add(head);
    this.head = head;

    const skull = box(1.7, 1.5, 2.0, hide);
    skull.position.set(0, 0, 0.4);
    head.add(skull);
    const snout = box(1.25, 1.05, 1.1, hide);
    snout.position.set(0, -0.15, 1.6);
    head.add(snout);
    const lip = box(1.3, 0.3, 0.5, belly);
    lip.position.set(0, -0.62, 1.9);
    head.add(lip);

    const hornMat = mat(0xf2e6cf, { flatShading: true });
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1 * (v.boss ? 1.5 : 1), 7), hornMat);
    horn.position.set(0, 0.55, 2.05);
    horn.rotation.x = 0.5;
    horn.castShadow = true;
    head.add(horn);
    this.horn = horn;
    const horn2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 6), hornMat);
    horn2.position.set(0, 0.72, 1.25);
    horn2.rotation.x = 0.3;
    head.add(horn2);

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.6, 6), mat(dark));
      ear.position.set(sx * 0.62, 0.86, -0.25);
      ear.rotation.z = sx * 0.3;
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x241a12 }));
      eye.position.set(sx * 0.82, 0.22, 0.95);
      head.add(eye);
      this[`eye${sx > 0 ? 'R' : 'L'}`] = eye;
    }

    // ---- legs ------------------------------------------------------------
    this.legs = [];
    const legPos = [[-0.9, 1.35], [0.9, 1.35], [-0.95, -1.5], [0.95, -1.5]];
    legPos.forEach(([x, z], i) => {
      const hip = new THREE.Group();
      hip.position.set(x, -0.9, z);
      body.add(hip);
      const upper = box(0.75, 1.2, 0.85, hide);
      upper.position.y = -0.55;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -1.05;
      hip.add(knee);
      const lower = box(0.62, 0.9, 0.7, dark);
      lower.position.y = -0.4;
      knee.add(lower);
      const hoof = box(0.72, 0.35, 0.8, 0x50463c);
      hoof.position.y = -0.95;
      knee.add(hoof);
      this.legs.push({ hip, knee, i, front: z > 0 });
    });

    // ---- tail ------------------------------------------------------------
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -2.5);
    body.add(tail);
    const tailM = box(0.28, 0.28, 1.4, dark);
    tailM.position.z = -0.6;
    tail.add(tailM);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), mat(0x3d332a));
    tuft.position.z = -1.35;
    tail.add(tuft);
    this.tail = tail;

    // ---- health bar -------------------------------------------------------
    const bar = new THREE.Group();
    bar.position.y = 5.0 * (this.cfg.boss ? 1.25 : 1);
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

    // dust puff anchor at the front hooves
    this.frontAnchor = new THREE.Object3D();
    this.frontAnchor.position.set(0, -1.9, 2.2);
    body.add(this.frontAnchor);

    // blob shadow
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 20),
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
      if (hit.kind === 'tree' && hit.mesh) hit.mesh.userData.shake = 1;
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
    this.body.position.y = 2.1 - u * 1.1;
    this.root.scale.setScalar(this.scaleF * (1 - u * 0.12));
    this.bar.visible = false;
    if (u >= 1) {
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.material.transparent = true;
          o.material.opacity = Math.max(0, 1 - (this.dying - 1.1) * 1.6);
        }
      });
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
      leg.hip.rotation.x = Math.sin(p + off) * 0.6 * stride;
      leg.knee.rotation.x = Math.max(0, Math.sin(p + off + 1.0)) * 0.7 * stride;
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
    this.body.position.y = 2.1 + Math.abs(Math.sin(p)) * 0.08 * stride;
    this.neck.rotation.x = headPitch;
    this.tail.rotation.y = Math.sin(this.phase * 5) * 0.4;
    this.tail.rotation.x = -0.3 + Math.sin(this.phase * 3) * 0.1;

    // health bar
    const frac = THREE.MathUtils.clamp(this.hp / this.maxHp, 0, 1);
    this.barFill.scale.x = Math.max(frac, 0.001);
    this.barFill.position.x = -(1 - frac) * 1.42;
    this.barFill.material.color.setHSL(0.33 * frac, 0.75, 0.52);
    this.bar.visible = frac < 0.999 || this.cfg.boss === true;

    // hit flash
    const f = this.flash;
    if (f > 0 || this._wasFlash) {
      this.root.traverse((o) => {
        if (o.isMesh && o.material?.emissive) {
          if (this.burn > 0) o.material.emissive.setRGB(0.16 + f * 0.3, 0.07 + f * 0.13, 0);
          else o.material.emissive.setRGB(f * 0.7, f * 0.3, 0);
        }
      });
      this._wasFlash = f > 0 || this.burn > 0;
    } else if (this.burn > 0) {
      this.root.traverse((o) => { if (o.isMesh && o.material?.emissive) o.material.emissive.setRGB(0.16, 0.07, 0); });
      this._wasFlash = true;
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
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); }
    });
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
