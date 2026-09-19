// The player: a smooth, skinned T-Rex built from swept surfaces, not boxes.
import * as THREE from 'three';
import { REX, ATTACK, WORLD, COLORS } from './config.js';
import { makeProfile, tubeAlongZ, ellipsoid, capsule, cone, skinMaterial } from './geom.js';

const wrapPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// Bone layout along the body axis (local Z, hips at the origin).
const FORWARD_BONES = [
  ['spine', 1.00], ['chest', 0.95], ['neck1', 0.85], ['neck2', 0.70], ['headBone', 0.70],
];
const TAIL_BONES = [1.30, 1.20, 1.15, 1.10, 1.00];

// Rest curvature that turns the straight bind pose into a T-Rex silhouette.
const POSE = {
  body: -0.34,            // torso tipped up: the classic upright tyrannosaur stance
  spine: -0.05, chest: -0.2, neck1: -0.5, neck2: -0.32, head: 1.05,
  tail0: 0.34, tail: 0.04, // ... with the tail levelling out behind to balance it
};
const HIP_Y = 3.5;
// Rest angles that give the leg its digitigrade "Z": femur forward, shin back,
// metatarsus forward again onto the toes.
const LEG = { hip: -0.30, knee: 0.65, ankle: -0.45 };          // height of the hip pivot above the ground

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
    this.attackYaw = 0;       // visual body twist during the tail spin
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
      { z: zTail, v: 0.10 }, { z: zTail + 0.7, v: 0.24 }, { z: -4.4, v: 0.42 },
      { z: -3.3, v: 0.60 }, { z: -2.2, v: 0.82 }, { z: -1.1, v: 1.06 },
      { z: -0.3, v: 1.26 }, { z: 0.35, v: 1.28 }, { z: 1.0, v: 1.20 },
      { z: 1.55, v: 1.12 }, { z: 2.05, v: 1.0 }, { z: 2.5, v: 0.82 },
      { z: 2.95, v: 0.68 }, { z: 3.4, v: 0.62 }, { z: zHead, v: 0.60 },
    ]);
    const squashX = makeProfile([
      { z: zTail, v: 0.95 }, { z: -2, v: 0.90 }, { z: 0.8, v: 0.84 }, { z: 2.6, v: 0.88 }, { z: zHead, v: 0.95 },
    ]);
    const centerY = makeProfile([
      { z: zTail, v: 0 }, { z: -2.2, v: 0.06 }, { z: -0.3, v: -0.02 },
      { z: 1.0, v: -0.08 }, { z: 1.8, v: -0.1 }, { z: 2.6, v: 0.0 }, { z: zHead, v: 0.06 },
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
        out.lerp(cBelly, THREE.MathUtils.smoothstep(-s, -0.05, 0.6));
      },
    });

    const mesh = new THREE.SkinnedMesh(geo, this.mats.body);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(hips);
    body.add(mesh);
    this.mesh = mesh;

    // ---- head: a deep, narrow theropod skull with a hinged jaw -------------
    const head = new THREE.Group();
    head.scale.setScalar(1.12);
    this.headBone.add(head);
    this.head = head;

    // Upper skull. The cross-section is taller than it is wide and the lower
    // edge stays flat, which is what makes a tooth line read as a T-Rex snout
    // instead of a dog muzzle.
    const skullR = makeProfile([
      { z: -0.55, v: 0.30 }, { z: -0.3, v: 0.72 }, { z: 0.0, v: 0.92 },
      { z: 0.4, v: 0.90 }, { z: 0.85, v: 0.80 }, { z: 1.3, v: 0.68 },
      { z: 1.7, v: 0.55 }, { z: 1.95, v: 0.42 }, { z: 2.1, v: 0.18 },
    ]);
    const skullSquashY = 1.04, skullSquashX = makeProfile([
      { z: -0.55, v: 0.80 }, { z: 0.3, v: 0.76 }, { z: 1.2, v: 0.68 }, { z: 2.1, v: 0.62 },
    ]);
    const toothLine = -0.86;
    const skullCenter = (z) => toothLine + skullR(z) * skullSquashY;

    const skull = new THREE.Mesh(tubeAlongZ({
      zStart: -0.55, zEnd: 2.1, rings: 38, radial: 18,
      radius: skullR,
      squash: (z) => ({ x: skullSquashX(z), y: skullSquashY }),
      center: skullCenter,
    }), this.mats.skin);
    skull.castShadow = true;
    head.add(skull);

    // brow ridge + lacrimal horns: the angry-eyebrow silhouette
    for (const sx of [-1, 1]) {
      const brow = ellipsoid(0.17, 0.12, 0.34, this.mats.stripe, 14);
      brow.position.set(sx * 0.46, skullCenter(0.68) + 0.46, 0.68);
      brow.rotation.z = sx * 0.22;
      brow.rotation.y = sx * -0.12;
      head.add(brow);
      const hornlet = cone(0.1, 0.26, this.mats.stripe, 8);
      hornlet.position.set(sx * 0.47, skullCenter(0.78) + 0.54, 0.78);
      hornlet.rotation.z = sx * 0.5;
      head.add(hornlet);

      const eye = ellipsoid(0.17, 0.18, 0.15, this.mats.eye, 16);
      eye.position.set(sx * 0.48, skullCenter(0.58) + 0.14, 0.58);
      head.add(eye);
      const pupil = ellipsoid(0.07, 0.12, 0.08, this.mats.pupil, 12);
      pupil.position.set(sx * 0.57, skullCenter(0.58) + 0.14, 0.66);
      head.add(pupil);

      const nostril = ellipsoid(0.06, 0.05, 0.08, this.mats.pupil, 10);
      nostril.position.set(sx * 0.12, skullCenter(1.75) + 0.28, 1.75);
      head.add(nostril);
    }
    // a ridge along the top of the snout
    const snoutRidge = ellipsoid(0.13, 0.1, 0.7, this.mats.stripe, 12);
    snoutRidge.position.set(0, skullCenter(1.3) + 0.52, 1.3);
    head.add(snoutRidge);

    // upper teeth, biggest in the middle of the jaw
    const toothAt = (z) => {
      const big = 1 - Math.abs(z - 1.0) / 1.3;
      return 0.2 + Math.max(0, big) * 0.28;
    };
    for (let z = 0.1; z < 1.98; z += 0.26) {
      for (const sx of [-1, 1]) {
        const len = toothAt(z);
        const t = cone(0.075, len, this.mats.tooth, 8);
        t.position.set(sx * (skullR(z) * skullSquashX(z) - 0.07), toothLine - len * 0.35, z);
        t.rotation.x = Math.PI;
        head.add(t);
      }
    }

    // ---- lower jaw ---------------------------------------------------------
    const jaw = new THREE.Group();
    jaw.position.set(0, toothLine - 0.12, -0.45);
    head.add(jaw);
    this.jaw = jaw;

    const jawR = makeProfile([
      { z: 0, v: 0.2 }, { z: 0.3, v: 0.68 }, { z: 0.9, v: 0.62 },
      { z: 1.6, v: 0.52 }, { z: 2.1, v: 0.38 }, { z: 2.45, v: 0.12 },
    ]);
    const jawMesh = new THREE.Mesh(tubeAlongZ({
      zStart: 0, zEnd: 2.45, rings: 28, radial: 16,
      radius: jawR,
      squash: () => ({ x: 0.86, y: 0.5 }),
      center: () => -0.1,
    }), this.mats.skin);
    jawMesh.castShadow = true;
    jaw.add(jawMesh);

    const tongue = ellipsoid(0.26, 0.07, 0.7, this.mats.tongue, 14);
    tongue.position.set(0, 0.08, 1.0);
    jaw.add(tongue);
    for (let z = 0.45; z < 2.2; z += 0.27) {
      for (const sx of [-1, 1]) {
        const len = toothAt(z) * 0.8;
        const t = cone(0.065, len, this.mats.tooth, 8);
        t.position.set(sx * (jawR(z) * 0.78), 0.05 + len * 0.3, z);
        jaw.add(t);
      }
    }

    this.mouthAnchor = new THREE.Object3D();
    this.mouthAnchor.position.set(0, toothLine - 0.05, 2.2);
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

    // ---- legs: the massive drumsticks a tyrannosaur walks on ---------------
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 1.0, -0.15, -0.45);
      hip.rotation.x = LEG.hip;
      body.add(hip);

      const thigh = ellipsoid(0.7, 1.05, 0.92, this.mats.skin, 20);
      thigh.position.set(sx * 0.1, -0.62, 0.02);
      hip.add(thigh);
      const thighLow = capsule(0.44, 0.5, this.mats.skin, 16);
      thighLow.position.set(sx * 0.1, -1.32, 0);
      hip.add(thighLow);

      const knee = new THREE.Group();
      knee.position.set(sx * 0.1, -1.7, 0);
      knee.rotation.x = LEG.knee;
      hip.add(knee);
      const kneeCap = ellipsoid(0.34, 0.34, 0.38, this.mats.skin, 14);
      knee.add(kneeCap);
      const shin = capsule(0.3, 0.55, this.mats.skin, 14);
      shin.position.set(0, -0.52, 0);
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.set(0, -1.05, 0);
      ankle.rotation.x = LEG.ankle;
      knee.add(ankle);
      const hock = ellipsoid(0.24, 0.26, 0.26, this.mats.skin, 12);
      ankle.add(hock);
      const shank = capsule(0.2, 0.4, this.mats.skin, 12);
      shank.position.set(0, -0.3, 0.02);
      ankle.add(shank);
      const foot = ellipsoid(0.32, 0.17, 0.44, this.mats.skin, 14);
      foot.position.set(0, -0.58, 0.2);
      ankle.add(foot);
      for (let c = -1; c <= 1; c++) {
        const toe = capsule(0.13, 0.3, this.mats.skin, 10);
        toe.rotation.x = Math.PI / 2;
        toe.position.set(c * 0.23, -0.6, 0.54);
        ankle.add(toe);
        const claw = cone(0.075, 0.26, this.mats.tooth, 8);
        claw.rotation.x = Math.PI / 2 + 0.2;
        claw.position.set(c * 0.23, -0.62, 0.82);
        ankle.add(claw);
      }
      this.legs.push({ hip, knee, ankle, sx });
    }

    // ---- arms: small, but planted on the outside of the chest --------------
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.9, -0.22, 0.15);
      this.chest.add(arm);

      const shoulder = ellipsoid(0.27, 0.27, 0.3, this.mats.skin, 14);
      arm.add(shoulder);
      const upper = capsule(0.19, 0.46, this.mats.skin, 12);
      upper.position.set(sx * 0.06, -0.38, 0.05);
      arm.add(upper);

      const elbow = new THREE.Group();
      elbow.position.set(sx * 0.06, -0.68, 0.05);
      arm.add(elbow);
      const fore = capsule(0.155, 0.38, this.mats.skin, 12);
      fore.position.set(0, -0.28, 0.12);
      fore.rotation.x = -0.55;
      elbow.add(fore);
      const hand = ellipsoid(0.15, 0.13, 0.17, this.mats.skin, 12);
      hand.position.set(0, -0.52, 0.29);
      elbow.add(hand);
      for (let c = 0; c < 2; c++) {
        const claw = cone(0.055, 0.3, this.mats.tooth, 8);
        claw.position.set((c ? 0.09 : -0.09) * 1, -0.6, 0.44);
        claw.rotation.x = 1.15;
        elbow.add(claw);
      }

      arm.rotation.set(0.45, 0, sx * 0.26);
      elbow.rotation.x = -0.5;
      this.arms.push({ arm, elbow, sx });
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
    this.body.rotation.set(POSE.body, 0, 0);
    this.body.position.set(0, HIP_Y, 0);
    this.jaw.rotation.x = 0.05;
    for (const t of this.tail) t.rotation.set(0, 0, 0);
  }

  get mouthPosition() {
    this.mouthAnchor.updateWorldMatrix(true, false);
    return this.mouthAnchor.getWorldPosition(new THREE.Vector3());
  }

  get forward() {
    const a = this.yaw + this.attackYaw;
    return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
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

  startAttack(type, aimYaw = null) {
    if (!this.alive || this.attack) return false;
    if (this.cooldown[type] > 0) return false;
    const cfg = ATTACK[type];
    this.attack = { type, t: 0, dur: cfg.windup + cfg.active + 0.22, hitDone: false, aim: 0, dir: 1 };
    if (type === 'tail') {
      // face whatever we are about to hit, then spin that way
      const aim = aimYaw === null ? 0 : wrapPi(aimYaw - this.yaw);
      this.attack.aim = aim;
      this.attack.dir = aim < -0.05 ? -1 : 1;
    }
    this.cooldown[type] = cfg.cooldown;
    return true;
  }

  /**
   * Tail swing: turn onto the target, carry the body through a full circle so
   * the tail sweeps everything around, then unwind back to where we started.
   */
  _spinYaw(a, cfg) {
    const turnEnd = cfg.windup;
    const spinEnd = cfg.windup + cfg.active;
    const full = Math.PI * 2 * a.dir;
    if (a.t <= turnEnd) {
      const u = a.t / turnEnd;
      return a.aim * (1 - Math.pow(1 - u, 3));            // ease out onto the target
    }
    if (a.t <= spinEnd) {
      const u = (a.t - turnEnd) / (spinEnd - turnEnd);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      return a.aim + full * e;                            // the sweep
    }
    const u = THREE.MathUtils.clamp((a.t - spinEnd) / (a.dur - spinEnd), 0, 1);
    return a.aim + full - a.aim * (1 - Math.pow(1 - u, 3)); // settle back to the start
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
    const spinning = this.attack?.type === 'tail';
    if (breathing || (attacking && !spinning)) desiredYaw = camYaw;
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
      if (a.type === 'tail') this.attackYaw = this._spinYaw(a, cfg);
      if (a.t >= a.dur) { this.attack = null; this.attackYaw = 0; }
    } else if (this.attackYaw !== 0) {
      this.attackYaw = 0;
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
    root.rotation.y = this.yaw + this.attackYaw;
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
      leg.hip.rotation.x = LEG.hip + sw * 0.5 * stride + (this.grounded ? 0 : -0.45);
      leg.knee.rotation.x = LEG.knee + lift * 0.7 * stride + (this.grounded ? 0 : 0.5);
      leg.ankle.rotation.x = LEG.ankle - lift * 0.45 * stride;
    }

    const bob = Math.sin(p * 2) * 0.09 * stride;
    body.position.y = HIP_Y + bob + (this.grounded ? 0 : 0.15);
    body.rotation.x = POSE.body + stride * 0.16 + Math.sin(p * 2 + 1) * 0.02;
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
        const wind = THREE.MathUtils.clamp(whip.t / cfg.windup, 0, 1);
        const spin = THREE.MathUtils.clamp((whip.t - cfg.windup) / cfg.active, 0, 1);
        // coil the opposite way during the wind-up, then let the spin drag it round
        const coil = -whip.dir * 0.55 * Math.sin(wind * Math.PI * 0.5) * (1 - spin);
        const trail = -whip.dir * 1.35 * Math.sin(Math.min(spin, 1) * Math.PI) ** 0.6;
        ry += (coil + trail) * (0.14 + k * 0.3);
        rx += 0.06 * (1 - k) * spin;
      }
      t.rotation.y = ry;
      t.rotation.x = rx;
      t.rotation.z = Math.sin(p - i * 0.4) * 0.04;
    }

    for (const a of this.arms) {
      const swing = Math.sin(p + (a.sx > 0 ? 0 : Math.PI)) * 0.22 * stride;
      a.arm.rotation.x = 0.45 + swing;
      a.arm.rotation.z = a.sx * (0.22 + Math.sin(p * 2) * 0.05 * stride);
      a.elbow.rotation.x = -0.5 - Math.max(0, swing) * 0.6;
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
    if (whip) body.rotation.z += Math.sin(whip.t * 7) * 0.12 * whip.dir;

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
