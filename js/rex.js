// The player: a smooth, skinned T-Rex built from swept surfaces, not boxes.
import * as THREE from 'three';
import { REX, ATTACK, WORLD, COLORS } from './config.js';
import { makeProfile, tubeAlongZ, ellipsoid, capsule, cone, skinMaterial } from './geom.js';

// Bone layout along the body axis (local Z, hips at the origin).
const FORWARD_BONES = [
  ['spine', 1.05], ['chest', 1.00], ['neck1', 1.10], ['neck2', 0.90], ['headBone', 0.85],
];
const TAIL_BONES = [1.35, 1.15, 1.10, 1.05, 1.00];

// Rest curvature that turns the straight bind pose into a T-Rex silhouette.
const POSE = { spine: -0.08, chest: -0.32, neck1: -0.78, neck2: -0.56, head: 1.42, tail0: 0.14, tail: 0.02 };
const HIP_Y = 3.1;          // height of the hip pivot above the ground

export class Rex {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 18);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.hp = REX.maxHp;
    this.fire = REX.maxFire;
    this.lastHit = -99;
    this.invuln = 0;
    this.phase = 0;
    this.speed = 0;
    this.attack = null;
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

    const body = new THREE.Group();     // hips pivot: everything hangs off this
    body.position.y = HIP_Y;
    root.add(body);
    this.body = body;

    const skin = COLORS.rexBody, belly = COLORS.rexBelly, stripe = COLORS.rexStripe;
    this.mats = {
      skin: skinMaterial(skin),
      stripe: skinMaterial(stripe),
      belly: skinMaterial(belly),
      tooth: skinMaterial(0xfffdf0, { shininess: 40 }),
      body: skinMaterial(0xffffff, { vertexColors: true }),
      eye: new THREE.MeshPhongMaterial({ color: 0xfffdf5, shininess: 70 }),
      pupil: new THREE.MeshBasicMaterial({ color: 0x1d120a }),
      tongue: skinMaterial(0xf07a8f),
    };

    // ---- skeleton --------------------------------------------------------
    const bones = [];
    const hips = new THREE.Bone();
    hips.name = 'hips';
    hips.userData.z = 0;
    bones.push(hips);
    const boneZ = [{ z: 0, index: 0 }];

    let parent = hips, z = 0;
    for (const [name, dz] of FORWARD_BONES) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.z = dz;
      parent.add(b);
      z += dz;
      b.userData.z = z;
      boneZ.push({ z, index: bones.length });
      bones.push(b);
      this[name] = b;
      parent = b;
    }

    this.tail = [];
    parent = hips; z = 0;
    for (const dz of TAIL_BONES) {
      const b = new THREE.Bone();
      b.name = `tail${this.tail.length}`;
      b.position.z = -dz;
      parent.add(b);
      z -= dz;
      b.userData.z = z;
      boneZ.push({ z, index: bones.length });
      bones.push(b);
      this.tail.push(b);
      parent = b;
    }
    boneZ.sort((a, b) => a.z - b.z);
    this.neck = this.neck1;
    this._neckRestZ = this.neck1.position.z;

    // ---- skinned body surface -------------------------------------------
    const zTail = -(TAIL_BONES.reduce((a, b) => a + b, 0)) - 0.7;
    const zHead = FORWARD_BONES.reduce((a, b) => a + b[1], 0) - 0.15;
    const radius = makeProfile([
      { z: zTail, v: 0.09 }, { z: zTail + 0.7, v: 0.22 }, { z: -4.6, v: 0.38 },
      { z: -3.6, v: 0.52 }, { z: -2.5, v: 0.70 }, { z: -1.35, v: 0.92 },
      { z: -0.5, v: 1.02 }, { z: 0.2, v: 1.14 }, { z: 1.05, v: 1.18 },
      { z: 1.8, v: 1.14 }, { z: 2.35, v: 1.02 }, { z: 2.9, v: 0.86 },
      { z: 3.4, v: 0.74 }, { z: 3.9, v: 0.66 }, { z: zHead, v: 0.62 },
    ]);
    const squashX = makeProfile([
      { z: zTail, v: 0.95 }, { z: -2, v: 0.92 }, { z: 0.8, v: 0.87 }, { z: 3.2, v: 0.92 }, { z: zHead, v: 0.97 },
    ]);
    const centerY = makeProfile([
      { z: zTail, v: 0 }, { z: -2, v: 0.03 }, { z: 0.3, v: -0.06 },
      { z: 1.3, v: -0.08 }, { z: 2.6, v: 0.0 }, { z: zHead, v: 0.05 },
    ]);
    const cBody = new THREE.Color(skin), cBelly = new THREE.Color(belly), cStripe = new THREE.Color(stripe);

    const geo = tubeAlongZ({
      zStart: zTail, zEnd: zHead, rings: 92, radial: 20,
      radius,
      squash: (z) => ({ x: squashX(z), y: 1 }),
      center: centerY,
      boneZ,
      color: (z, a, out) => {
        const s = Math.sin(a);
        out.copy(cBody);
        const band = Math.pow(Math.max(0, Math.sin(z * 1.45 + 0.4)), 8);
        out.lerp(cStripe, Math.max(0, s) * band * 0.95);
        out.lerp(cBelly, THREE.MathUtils.smoothstep(-s, 0.2, 0.8));
      },
    });

    const mesh = new THREE.SkinnedMesh(geo, this.mats.body);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(hips);
    body.add(mesh);
    this.mesh = mesh;

    // ---- head ------------------------------------------------------------
    const head = new THREE.Group();
    head.scale.setScalar(1.32);
    this.headBone.add(head);
    this.head = head;

    const skull = ellipsoid(0.68, 0.62, 0.9, this.mats.skin, 20);
    skull.position.set(0, 0.1, 0.5);
    head.add(skull);
    const cheek = ellipsoid(0.56, 0.48, 0.55, this.mats.skin, 18);
    cheek.position.set(0, -0.02, 1.15);
    head.add(cheek);
    const snout = ellipsoid(0.45, 0.35, 0.72, this.mats.skin, 18);
    snout.position.set(0, -0.02, 1.72);
    head.add(snout);
    const nose = ellipsoid(0.34, 0.29, 0.3, this.mats.skin, 16);
    nose.position.set(0, 0.0, 2.28);
    head.add(nose);
    const crest = ellipsoid(0.5, 0.16, 0.6, this.mats.stripe, 16);
    crest.position.set(0, 0.55, 0.75);
    head.add(crest);

    for (const sx of [-1, 1]) {
      const brow = ellipsoid(0.22, 0.13, 0.3, this.mats.stripe, 14);
      brow.position.set(sx * 0.44, 0.44, 1.12);
      brow.rotation.z = sx * 0.2;
      head.add(brow);
      const eye = ellipsoid(0.19, 0.19, 0.19, this.mats.eye, 16);
      eye.position.set(sx * 0.46, 0.27, 1.16);
      head.add(eye);
      const pupil = ellipsoid(0.1, 0.11, 0.1, this.mats.pupil, 12);
      pupil.position.set(sx * 0.53, 0.28, 1.29);
      head.add(pupil);
      const nostril = ellipsoid(0.07, 0.06, 0.07, this.mats.pupil, 10);
      nostril.position.set(sx * 0.16, 0.14, 2.5);
      head.add(nostril);
    }

    for (let i = 0; i < 7; i++) {
      for (const sx of [-1, 1]) {
        const t = cone(0.07, 0.26, this.mats.tooth, 8);
        t.position.set(sx * (0.4 - i * 0.012), -0.26 - Math.sin(i * 0.4) * 0.02, 0.85 + i * 0.25);
        t.rotation.x = Math.PI;
        head.add(t);
      }
    }

    const jaw = new THREE.Group();
    jaw.position.set(0, -0.28, 0.42);
    head.add(jaw);
    this.jaw = jaw;
    const jawM = ellipsoid(0.42, 0.21, 0.92, this.mats.skin, 18);
    jawM.position.set(0, -0.08, 0.92);
    jaw.add(jawM);
    const chin = ellipsoid(0.3, 0.17, 0.3, this.mats.skin, 14);
    chin.position.set(0, -0.05, 1.75);
    jaw.add(chin);
    const tongue = ellipsoid(0.24, 0.07, 0.52, this.mats.tongue, 14);
    tongue.position.set(0, 0.08, 0.95);
    jaw.add(tongue);
    for (let i = 0; i < 6; i++) {
      for (const sx of [-1, 1]) {
        const t = cone(0.065, 0.26, this.mats.tooth, 8);
        t.position.set(sx * 0.34, 0.1, 0.5 + i * 0.26);
        jaw.add(t);
      }
    }

    this.mouthAnchor = new THREE.Object3D();
    this.mouthAnchor.position.set(0, -0.08, 2.6);
    head.add(this.mouthAnchor);

    // ---- dorsal ridge ------------------------------------------------------
    const ridge = [[this.chest, 0.15], [this.spine, 0.1], [hips, 0.0], [this.tail[0], -0.2], [this.tail[1], -0.3]];
    ridge.forEach(([bone, dz], i) => {
      const zz = bone.userData.z + dz;
      const sp = cone(0.26 - i * 0.03, 0.85 - i * 0.11, this.mats.stripe, 8);
      sp.position.set(0, centerY(zz) + radius(zz) * 0.9, dz);
      sp.rotation.x = -0.2;
      bone.add(sp);
    });

    // ---- legs --------------------------------------------------------------
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 1.02, -0.25, -0.35);
      body.add(hip);
      const hipMass = ellipsoid(0.5, 0.85, 0.88, this.mats.skin, 18);
      hipMass.position.set(-sx * 0.12, -0.32, -0.05);
      hip.add(hipMass);
      const thigh = capsule(0.52, 0.55, this.mats.skin, 16);
      thigh.position.set(0, -0.72, 0.02);
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -1.3;
      hip.add(knee);
      const shin = capsule(0.34, 0.55, this.mats.skin, 14);
      shin.position.set(0, -0.52, -0.05);
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.set(0, -1.05, 0);
      knee.add(ankle);
      const shank = capsule(0.23, 0.42, this.mats.skin, 12);
      shank.position.set(0, -0.2, 0.05);
      ankle.add(shank);
      const foot = ellipsoid(0.36, 0.19, 0.5, this.mats.skin, 14);
      foot.position.set(0, -0.44, 0.2);
      ankle.add(foot);
      for (let c = -1; c <= 1; c++) {
        const toe = capsule(0.14, 0.26, this.mats.skin, 10);
        toe.rotation.x = Math.PI / 2;
        toe.position.set(c * 0.24, -0.46, 0.56);
        ankle.add(toe);
        const claw = cone(0.075, 0.24, this.mats.tooth, 8);
        claw.rotation.x = Math.PI / 2 + 0.15;
        claw.position.set(c * 0.24, -0.46, 0.84);
        ankle.add(claw);
      }
      this.legs.push({ hip, knee, ankle, sx });
    }

    // ---- arms --------------------------------------------------------------
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.95, 0.15, 2.0);
      body.add(arm);
      const upper = capsule(0.16, 0.5, this.mats.skin, 10);
      upper.position.y = -0.35;
      arm.add(upper);
      const fore = capsule(0.13, 0.42, this.mats.skin, 10);
      fore.position.set(0, -0.9, 0.16);
      fore.rotation.x = -0.4;
      arm.add(fore);
      for (let c = 0; c < 2; c++) {
        const claw = cone(0.055, 0.26, this.mats.tooth, 8);
        claw.position.set(-0.08 + c * 0.16, -1.22, 0.35);
        claw.rotation.x = 1.25;
        arm.add(claw);
      }
      arm.rotation.x = 0.45;
      this.arms.push(arm);
    }

    // ---- soft contact shadow ------------------------------------------------
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 28),
      new THREE.MeshBasicMaterial({ color: 0x2c4a1e, transparent: true, opacity: 0.22, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    root.add(blob);
    this.blob = blob;

    root.position.copy(this.pos);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    this.spine.rotation.x = POSE.spine;
    this.chest.rotation.x = POSE.chest;
    this.neck1.rotation.x = POSE.neck1;
    this.neck2.rotation.x = POSE.neck2;
    this.headBone.rotation.x = POSE.head;
  }

  resetPose() {
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, HIP_Y, 0);
    this.jaw.rotation.x = 0.05;
    for (const t of this.tail) t.rotation.set(0, 0, 0);
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

    const attacking = !!this.attack;
    const wish = new THREE.Vector3();
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

    if (input.consume('jump') && this.grounded && this.alive) {
      this.vy = REX.jumpSpeed;
      this.grounded = false;
    }
    this.vy += WORLD.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    let desiredYaw = this.yaw;
    if (breathing || attacking) desiredYaw = camYaw;
    else if (wish.lengthSq() > 0.01) desiredYaw = Math.atan2(wish.x, wish.z);
    let d = desiredYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, REX.turnLerp * dt);

    let hitEvent = null;
    if (this.attack) {
      const a = this.attack;
      const cfg = ATTACK[a.type];
      a.t += dt;
      if (!a.hitDone && a.t >= cfg.windup) { a.hitDone = true; hitEvent = a.type; }
      if (a.t >= a.dur) this.attack = null;
    }

    if (breathing) {
      this.fire = Math.max(0, this.fire - REX.fireCost * dt);
      if (this.fire <= 0) this.breathing = false;
    } else {
      this.fire = Math.min(REX.maxFire, this.fire + REX.fireRegen * dt);
    }

    if (this.alive && this.lastHit > REX.regenDelay) this.heal(REX.hpRegen * dt);

    this._animate(dt);
    return hitEvent;
  }

  _animate(dt) {
    const root = this.root, body = this.body;
    root.position.set(this.pos.x, this.y, this.pos.z);
    root.rotation.y = this.yaw;
    this.blob.position.y = 0.03 - this.y;

    this.phase += dt * (2.2 + Math.min(this.speed / REX.sprintSpeed, 1.4) * 9.5);
    const p = this.phase;
    const stride = Math.min(this.speed / REX.walkSpeed, 1.35);

    if (!this.alive) {
      body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 1.3, dt * 3);
      body.position.y = THREE.MathUtils.lerp(body.position.y, 1.5, dt * 3);
      this.jaw.rotation.x = THREE.MathUtils.lerp(this.jaw.rotation.x, 0.5, dt * 3);
      this.neck1.rotation.x = THREE.MathUtils.lerp(this.neck1.rotation.x, 0.1, dt * 2);
      for (const t of this.tail) t.rotation.y = THREE.MathUtils.lerp(t.rotation.y, 0.1, dt * 2);
      return;
    }

    for (const leg of this.legs) {
      const off = leg.sx > 0 ? 0 : Math.PI;
      const sw = Math.sin(p + off);
      const lift = Math.max(0, Math.sin(p + off + 0.6));
      leg.hip.rotation.x = sw * 0.52 * stride + (this.grounded ? 0 : -0.5);
      leg.knee.rotation.x = -lift * 0.9 * stride - 0.1 + (this.grounded ? 0 : 0.7);
      leg.ankle.rotation.x = lift * 0.5 * stride + 0.08;
    }

    const bob = Math.sin(p * 2) * 0.09 * stride;
    body.position.y = HIP_Y + bob + (this.grounded ? 0 : 0.15);
    body.rotation.x = 0.02 + stride * 0.1 + Math.sin(p * 2 + 1) * 0.02;
    body.rotation.z = Math.sin(p) * 0.05 * stride;
    body.rotation.y = Math.sin(p) * 0.05 * stride;

    // spine counter-sway keeps the smooth body feeling alive
    this.spine.rotation.x = POSE.spine - stride * 0.03;
    this.spine.rotation.y = Math.sin(p) * 0.035 * stride;
    this.chest.rotation.x = POSE.chest - stride * 0.02;
    this.chest.rotation.y = Math.sin(p + 0.6) * 0.03 * stride;

    const whip = this.attack?.type === 'tail' ? this.attack : null;
    for (let i = 0; i < this.tail.length; i++) {
      const t = this.tail[i];
      const k = i / this.tail.length;
      let ry = Math.sin(p - i * 0.55) * (0.04 + 0.06 * stride);
      let rx = Math.sin(p * 2 - i * 0.5) * 0.035 + (i === 0 ? POSE.tail0 : POSE.tail);
      if (whip) {
        const cfg = ATTACK.tail;
        const u = THREE.MathUtils.clamp(whip.t / (cfg.windup + cfg.active), 0, 1);
        const swing = u < 0.35
          ? THREE.MathUtils.lerp(0, -1.1, u / 0.35)
          : THREE.MathUtils.lerp(-1.1, 1.5, (u - 0.35) / 0.65);
        ry += swing * (0.10 + k * 0.22);
        rx -= 0.05 * k;
      }
      t.rotation.y = ry;
      t.rotation.x = rx;
      t.rotation.z = Math.sin(p - i * 0.4) * 0.04;
    }

    for (let i = 0; i < this.arms.length; i++) {
      this.arms[i].rotation.x = 0.45 + Math.sin(p + i * 2) * 0.16 * stride;
      this.arms[i].rotation.z = (i ? -1 : 1) * 0.14;
    }

    let jawOpen = 0.05 + Math.sin(this.phase * 0.8) * 0.02;
    let headPitch = Math.sin(p * 2) * 0.05 * stride;
    let neckPitch = 0;
    let lunge = 0;

    const bite = this.attack?.type === 'bite' ? this.attack : null;
    if (bite) {
      const u = THREE.MathUtils.clamp(bite.t / bite.dur, 0, 1);
      if (u < 0.32) { jawOpen = THREE.MathUtils.lerp(0.05, 1.0, u / 0.32); lunge = u / 0.32 * 0.5; neckPitch += u * 0.32; }
      else if (u < 0.52) { jawOpen = THREE.MathUtils.lerp(1.0, 0.02, (u - 0.32) / 0.2); lunge = 1.0; headPitch += 0.32; neckPitch += 0.32; }
      else { jawOpen = THREE.MathUtils.lerp(0.02, 0.05, (u - 0.52) / 0.48); lunge = THREE.MathUtils.lerp(1.0, 0, (u - 0.52) / 0.48); }
      body.rotation.x += lunge * 0.14;
    }
    if (this.breathing) {
      jawOpen = 0.9 + Math.sin(this.phase * 18) * 0.06;
      neckPitch -= 0.14;
      headPitch += 0.1;
    }
    if (this.roar > 0) jawOpen = Math.max(jawOpen, 0.85 * this.roar);
    if (whip) body.rotation.y += Math.sin(whip.t * 9) * 0.22;

    this.jaw.rotation.x = jawOpen;
    this.neck1.rotation.x = POSE.neck1 + neckPitch * 0.6 - stride * 0.05;
    this.neck2.rotation.x = POSE.neck2 + neckPitch * 0.4;
    this.neck1.position.z = this._neckRestZ + lunge * 0.55;
    this.headBone.rotation.x = POSE.head + headPitch;

    if (this.hurtFlash > 0) {
      const f = this.hurtFlash;
      for (const k in this.mats) this.mats[k].emissive?.setRGB(f * 0.6, 0, 0);
      this._flashed = true;
    } else if (this._flashed) {
      for (const k in this.mats) this.mats[k].emissive?.setRGB(0, 0, 0);
      this._flashed = false;
    }
  }
}
