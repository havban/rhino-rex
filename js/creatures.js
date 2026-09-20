/**
 * The two hunters that are not dinosaurs.
 *
 * They share the T-Rex's *skeleton* — the same hips/spine/chest/neck/head
 * chain, the same tail bones, the same leg and arm handles — because that is
 * what the animator in js/rex.js drives. Everything hanging off it is built
 * from scratch here: a kaiju is not a fat T-Rex and an ape is not a T-Rex
 * with long arms.
 *
 * Each builder must leave behind:
 *   rex.mesh        the skinned body (bound by the caller)
 *   rex.head, rex.jaw, rex.mouthAnchor
 *   rex.legs        [{ hip, knee, ankle, sx }]
 *   rex.arms        [{ arm, elbow, sx }]
 *   rex.wings       (empty here)
 */
import * as THREE from 'three';
import { makeProfile, tubeAlongZ, ellipsoid, capsule, cone } from './geom.js';

const FORWARD_TOTAL = 4.2;        // hips -> head bone, matching rex.js

// ============================================================== the kaiju ==
/**
 * Gojira: a slab of a thing. Deep barrel chest, column legs it stands on
 * rather than runs on, a tail as thick as the body, and three rows of
 * maple-leaf plates from the shoulders to the tail tip.
 */
export function buildKaiju(rex, f, hips, boneZ, body, sk) {
  const M = rex.mats;
  const zTail = -6.9 * f.tail;
  const zHead = FORWARD_TOTAL - 0.2;

  // ---- body: heavy through the hips and chest, thick right down the tail --
  const radius = makeProfile([
    { z: zTail, v: 0.16 }, { z: zTail * 0.82, v: 0.46 }, { z: zTail * 0.6, v: 0.82 },
    { z: zTail * 0.4, v: 1.22 }, { z: zTail * 0.2, v: 1.62 }, { z: -0.3, v: 1.92 },
    { z: 0.5, v: 1.98 }, { z: 1.3, v: 1.86 }, { z: 2.0, v: 1.52 },
    { z: 2.6, v: 1.02 }, { z: 3.1, v: 0.74 }, { z: 3.6, v: 0.62 }, { z: zHead, v: 0.58 },
  ]);
  const squashX = makeProfile([
    { z: zTail, v: 1.0 }, { z: -2.0, v: 1.06 }, { z: 0.4, v: 1.02 },
    { z: 2.2, v: 0.92 }, { z: zHead, v: 0.9 },
  ]);
  const centerY = makeProfile([
    { z: zTail, v: 0.1 }, { z: -2.2, v: 0.02 }, { z: 0.2, v: -0.12 },
    { z: 1.6, v: -0.14 }, { z: 2.6, v: 0.04 }, { z: zHead, v: 0.12 },
  ]);
  const cBody = new THREE.Color(sk.body);
  const cBelly = new THREE.Color(sk.belly);
  const cStripe = new THREE.Color(sk.stripe);

  const geo = tubeAlongZ({
    zStart: zTail, zEnd: zHead, rings: 96, radial: 22,
    radius, squash: (z) => ({ x: squashX(z), y: 1 }), center: centerY, boneZ,
    color: (z, a, out) => {
      const s = Math.sin(a);
      out.copy(cBody);
      // hide-plate banding along the flanks, and a pale segmented belly
      const band = Math.pow(Math.max(0, Math.sin(z * 2.1)), 6);
      out.lerp(cStripe, Math.max(0, -s) * band * 0.4);
      out.lerp(cBelly, THREE.MathUtils.smoothstep(-s, 0.15, 0.85));
    },
  });
  const mesh = new THREE.SkinnedMesh(geo, M.body);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.add(hips);
  body.add(mesh);
  rex.mesh = mesh;

  // ---- head: broad and blunt, nothing like a theropod's narrow snout ------
  const head = new THREE.Group();
  head.scale.setScalar(1.05);
  rex.headBone.add(head);
  rex.head = head;

  const cranium = ellipsoid(0.92, 0.82, 1.0, M.skin, 18);
  cranium.position.set(0, 0.1, 0.35);
  head.add(cranium);
  const snout = ellipsoid(0.8, 0.58, 0.95, M.skin, 16);
  snout.position.set(0, -0.06, 1.45);
  head.add(snout);
  const crest = ellipsoid(0.5, 0.2, 0.75, M.stripe, 12);
  crest.position.set(0, 0.78, 0.45);
  head.add(crest);

  for (const sx of [-1, 1]) {
    const brow = ellipsoid(0.34, 0.18, 0.42, M.stripe, 12);
    brow.position.set(sx * 0.6, 0.52, 0.78);
    brow.rotation.z = sx * 0.28;
    head.add(brow);
    const horn = cone(0.16, 0.5, M.plate, 6);
    horn.position.set(sx * 0.72, 0.68, 0.0);
    horn.rotation.set(-0.5, 0, sx * 0.7);
    head.add(horn);
    const eye = ellipsoid(0.19, 0.2, 0.17, M.eye, 14);
    eye.position.set(sx * 0.66, 0.24, 0.78);
    head.add(eye);
    const pupil = ellipsoid(0.08, 0.13, 0.09, M.pupil, 10);
    pupil.position.set(sx * 0.76, 0.24, 0.86);
    head.add(pupil);
    const nostril = ellipsoid(0.08, 0.06, 0.09, M.pupil, 8);
    nostril.position.set(sx * 0.22, 0.28, 2.3);
    head.add(nostril);
  }

  // upper teeth in a straight, blunt line
  const toothLine = -0.42;
  for (let z = 0.5; z < 2.2; z += 0.3) {
    for (const sx of [-1, 1]) {
      const t = cone(0.09, 0.34, M.tooth, 7);
      t.position.set(sx * 0.62, toothLine + 0.06, z);
      t.rotation.x = Math.PI;
      head.add(t);
    }
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, toothLine - 0.06, 0.15);
  head.add(jaw);
  rex.jaw = jaw;
  const jawMesh = ellipsoid(0.76, 0.3, 1.1, M.skin, 16);
  jawMesh.position.set(0, -0.18, 1.0);
  jaw.add(jawMesh);
  const throat = ellipsoid(0.6, 0.22, 0.7, M.belly, 12);
  throat.position.set(0, -0.3, 0.5);
  jaw.add(throat);
  const tongue = ellipsoid(0.34, 0.08, 0.7, M.tongue, 12);
  tongue.position.set(0, -0.02, 1.15);
  jaw.add(tongue);
  for (let z = 0.5; z < 2.0; z += 0.32) {
    for (const sx of [-1, 1]) {
      const t = cone(0.08, 0.3, M.tooth, 7);
      t.position.set(sx * 0.56, 0.06, z);
      jaw.add(t);
    }
  }

  rex.mouthAnchor = new THREE.Object3D();
  rex.mouthAnchor.position.set(0, toothLine + 0.1, 2.4);
  head.add(rex.mouthAnchor);

  // ---- three rows of dorsal plates, neck to tail tip ---------------------
  const rows = [
    { off: 0.0, scale: 1.0 },
    { off: -0.42, scale: 0.55 },
    { off: 0.42, scale: 0.55 },
  ];
  const spine = [
    [rex.neck1, 0.15, 0.6], [rex.chest, 0.3, 0.95], [rex.chest, -0.4, 1.15],
    [rex.spine, 0.2, 1.25], [rex.spine, -0.4, 1.3], [hips, -0.1, 1.2],
    [rex.tail[0], -0.4, 1.05], [rex.tail[1], -0.4, 0.88], [rex.tail[2], -0.4, 0.66],
    [rex.tail[3], -0.4, 0.44], [rex.tail[4], -0.4, 0.26],
  ];
  spine.forEach(([bone, dz, size]) => {
    const zz = bone.userData.z + dz;
    const up = centerY(zz) + radius(zz) * 0.92;
    for (const r of rows) {
      const plate = cone(1.05 * size * r.scale, 2.0 * size * r.scale, M.plate, 5);
      plate.position.set(r.off * size * 1.5, up - Math.abs(r.off) * 0.8 * size, dz);
      plate.rotation.set(-0.22, 0, r.off * 0.5);
      plate.scale.x = 0.2;
      bone.add(plate);
    }
  });

  // ---- legs: columns, not drumsticks -------------------------------------
  rex.legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 1.08, -0.35, -0.15);
    hips.add(hip);
    hip.rotation.x = rex.leg.hip;

    const thigh = ellipsoid(0.78, 1.15, 0.9, M.skin, 18);
    thigh.position.y = -0.55;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -1.3;
    hip.add(knee);
    knee.rotation.x = rex.leg.knee;
    const shin = capsule(0.56, 0.7, M.skin, 14);
    shin.position.y = -0.5;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -1.05;
    knee.add(ankle);
    ankle.rotation.x = rex.leg.ankle;
    const foot = ellipsoid(0.62, 0.32, 0.92, M.skin, 14);
    foot.position.set(0, -0.28, 0.22);
    ankle.add(foot);
    for (let t = -1; t <= 1; t++) {
      const toe = ellipsoid(0.22, 0.2, 0.32, M.skin, 10);
      toe.position.set(t * 0.34, -0.3, 0.92);
      ankle.add(toe);
      const claw = cone(0.11, 0.34, M.tooth, 7);
      claw.position.set(t * 0.34, -0.34, 1.2);
      claw.rotation.x = 1.5;
      ankle.add(claw);
    }
    rex.legs.push({ hip, knee, ankle, sx });
  }

  // ---- arms: short, thick, held out in front ------------------------------
  rex.arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 1.45, -0.1, 0.25);
    rex.chest.add(arm);
    arm.add(ellipsoid(0.46, 0.46, 0.48, M.skin, 14));
    const upper = capsule(0.32, 0.5, M.skin, 12);
    upper.position.set(sx * 0.1, -0.5, 0.05);
    arm.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(sx * 0.1, -0.95, 0.05);
    arm.add(elbow);
    const fore = capsule(0.26, 0.45, M.skin, 12);
    fore.position.set(0, -0.35, 0.16);
    fore.rotation.x = -0.5;
    elbow.add(fore);
    const hand = ellipsoid(0.24, 0.2, 0.26, M.skin, 12);
    hand.position.set(0, -0.66, 0.4);
    elbow.add(hand);
    for (let c = -1; c <= 1; c++) {
      const claw = cone(0.07, 0.32, M.tooth, 7);
      claw.position.set(c * 0.13, -0.76, 0.56);
      claw.rotation.x = 1.2;
      elbow.add(claw);
    }
    arm.rotation.set(0.5, 0, sx * 0.3);
    elbow.rotation.x = -0.6;
    rex.arms.push({ arm, elbow, sx });
  }
  rex.wings = [];
}

// ================================================================= the ape ==
/**
 * Kong: a knuckle-walker. Huge sloping shoulders, a silver band across the
 * back, arms that reach the ground, short bowed legs and no tail at all.
 */
export function buildApe(rex, f, hips, boneZ, body, sk) {
  const M = rex.mats;
  const zBack = -1.5;
  const zHead = FORWARD_TOTAL - 0.5;

  // ---- torso: a barrel, widest across the shoulders ----------------------
  const radius = makeProfile([
    { z: zBack, v: 0.42 }, { z: -1.0, v: 1.0 }, { z: -0.3, v: 1.38 },
    { z: 0.4, v: 1.66 }, { z: 1.0, v: 1.76 }, { z: 1.6, v: 1.7 },
    { z: 2.2, v: 1.42 }, { z: 2.8, v: 0.94 }, { z: 3.3, v: 0.66 }, { z: zHead, v: 0.58 },
  ]);
  // widest across the shoulders, narrow at the hips: the classic wedge
  const squashX = makeProfile([
    { z: zBack, v: 0.86 }, { z: -0.3, v: 0.98 }, { z: 0.6, v: 1.14 },
    { z: 1.4, v: 1.3 }, { z: 2.4, v: 1.04 }, { z: zHead, v: 0.95 },
  ]);
  const centerY = makeProfile([
    { z: zBack, v: -0.1 }, { z: 0.2, v: -0.24 }, { z: 1.3, v: -0.04 },
    { z: 2.4, v: 0.16 }, { z: zHead, v: 0.22 },
  ]);
  const cBody = new THREE.Color(sk.body);
  const cBelly = new THREE.Color(sk.belly);
  const cStripe = new THREE.Color(sk.stripe);
  const cSilver = new THREE.Color(sk.plate || sk.belly);

  const geo = tubeAlongZ({
    zStart: zBack, zEnd: zHead, rings: 80, radial: 22,
    radius, squash: (z) => ({ x: squashX(z), y: 1 }), center: centerY, boneZ,
    color: (z, a, out) => {
      const s = Math.sin(a);
      out.copy(cBody);
      out.lerp(cStripe, THREE.MathUtils.smoothstep(-s, 0.2, 0.9) * 0.5);
      // the silverback saddle: a band across the upper back only, between the
      // rump and the shoulders, gone well before the flanks
      const saddle = THREE.MathUtils.smoothstep(z, -1.2, -0.1) * (1 - THREE.MathUtils.smoothstep(z, 0.7, 1.9));
      out.lerp(cSilver, THREE.MathUtils.smoothstep(s, 0.5, 1.0) * saddle * 0.72);
    },
  });
  const mesh = new THREE.SkinnedMesh(geo, M.body);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.add(hips);
  body.add(mesh);
  rex.mesh = mesh;

  // heavy trapezius over the shoulders, which is what makes an ape an ape
  const hump = ellipsoid(1.45, 0.7, 1.2, M.skin, 16);
  hump.position.set(0, 1.12, -0.05);
  rex.chest.add(hump);
  const rump = ellipsoid(1.25, 1.0, 1.0, M.skin, 14);
  rump.position.set(0, -0.15, -0.9);
  hips.add(rump);

  // ---- head: flat face, heavy brow, crested skull -------------------------
  const head = new THREE.Group();
  head.scale.setScalar(1.28);
  rex.headBone.add(head);
  rex.head = head;

  // furred braincase, rising to a sagittal crest front to back
  const brain = ellipsoid(0.64, 0.66, 0.7, M.skin, 16);
  brain.position.set(0, 0.2, 0.06);
  head.add(brain);
  const crest = ellipsoid(0.13, 0.26, 0.62, M.skin, 12);
  crest.position.set(0, 0.76, 0.02);
  head.add(crest);
  const cheekFur = ellipsoid(0.76, 0.46, 0.32, M.skin, 14);
  cheekFur.position.set(0, 0.04, 0.02);
  head.add(cheekFur);

  // the face itself: flat, black, set into the fur
  const face = ellipsoid(0.5, 0.52, 0.26, M.face, 16);
  face.position.set(0, -0.04, 0.64);
  head.add(face);
  const brow = ellipsoid(0.56, 0.16, 0.22, M.face, 14);
  brow.position.set(0, 0.34, 0.6);
  head.add(brow);
  const muzzle = ellipsoid(0.36, 0.3, 0.26, M.face, 14);
  muzzle.position.set(0, -0.3, 0.68);
  head.add(muzzle);
  const nose = ellipsoid(0.22, 0.15, 0.12, M.face, 12);
  nose.position.set(0, -0.12, 0.76);
  head.add(nose);

  for (const sx of [-1, 1]) {
    const eye = ellipsoid(0.085, 0.085, 0.06, M.eye, 12);
    eye.position.set(sx * 0.21, 0.13, 0.76);
    head.add(eye);
    const pupil = ellipsoid(0.055, 0.06, 0.04, M.pupil, 10);
    pupil.position.set(sx * 0.21, 0.12, 0.8);
    head.add(pupil);
    const nostril = ellipsoid(0.045, 0.035, 0.04, M.pupil, 8);
    nostril.position.set(sx * 0.1, -0.15, 0.85);
    head.add(nostril);
    const ear = ellipsoid(0.06, 0.15, 0.12, M.face, 10);
    ear.position.set(sx * 0.64, 0.2, -0.02);
    head.add(ear);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.3, 0.35);
  head.add(jaw);
  rex.jaw = jaw;
  const chin = ellipsoid(0.4, 0.24, 0.34, M.face, 12);
  chin.position.set(0, -0.14, 0.42);
  jaw.add(chin);
  const tongue = ellipsoid(0.2, 0.06, 0.28, M.tongue, 10);
  tongue.position.set(0, 0.02, 0.5);
  jaw.add(tongue);
  for (const sx of [-1, 1]) {
    const canine = cone(0.07, 0.3, M.tooth, 7);
    canine.position.set(sx * 0.22, 0.14, 0.62);
    jaw.add(canine);
    const upper = cone(0.08, 0.32, M.tooth, 7);
    upper.position.set(sx * 0.24, -0.3, 0.92);
    upper.rotation.x = Math.PI;
    head.add(upper);
  }

  rex.mouthAnchor = new THREE.Object3D();
  rex.mouthAnchor.position.set(0, -0.18, 1.1);
  head.add(rex.mouthAnchor);

  // ---- legs: short, thick, bowed -----------------------------------------
  rex.legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.82, -0.5, 0.1);
    hips.add(hip);
    hip.rotation.x = rex.leg.hip;

    const thigh = ellipsoid(0.56, 0.7, 0.62, M.skin, 14);
    thigh.position.set(sx * 0.1, -0.4, 0);
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(sx * 0.14, -0.85, 0);
    hip.add(knee);
    knee.rotation.x = rex.leg.knee;
    const shin = capsule(0.4, 0.4, M.skin, 12);
    shin.position.y = -0.34;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -0.7;
    knee.add(ankle);
    ankle.rotation.x = rex.leg.ankle;
    const foot = ellipsoid(0.38, 0.22, 0.6, M.skin, 12);
    foot.position.set(0, -0.18, 0.2);
    ankle.add(foot);
    const bigToe = ellipsoid(0.15, 0.13, 0.18, M.skin, 8);
    bigToe.position.set(sx * -0.32, -0.2, 0.3);
    ankle.add(bigToe);
    for (let t = -1; t <= 1; t++) {
      const toe = ellipsoid(0.1, 0.09, 0.14, M.skin, 8);
      toe.position.set(t * 0.17, -0.2, 0.68);
      ankle.add(toe);
    }
    rex.legs.push({ hip, knee, ankle, sx });
  }

  // ---- arms: the long ones, hanging to the knuckles -----------------------
  rex.arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 1.5, 0.55, 0.35);
    rex.chest.add(arm);

    const deltoid = ellipsoid(0.62, 0.64, 0.62, M.skin, 14);
    arm.add(deltoid);
    const upper = capsule(0.42, 1.0, M.skin, 14);
    upper.position.set(sx * 0.12, -0.9, 0);
    arm.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(sx * 0.16, -1.75, 0);
    arm.add(elbow);
    const fore = capsule(0.34, 0.95, M.skin, 13);
    fore.position.set(0, -0.72, 0.08);
    elbow.add(fore);
    const wrist = ellipsoid(0.3, 0.28, 0.3, M.skin, 10);
    wrist.position.set(0, -1.32, 0.08);
    elbow.add(wrist);
    const hand = ellipsoid(0.36, 0.27, 0.48, M.face, 12);
    hand.position.set(0, -1.6, 0.22);
    elbow.add(hand);
    for (let k = -1; k <= 2; k++) {
      const knuckle = ellipsoid(0.12, 0.12, 0.12, M.face, 8);
      knuckle.position.set((k - 0.5) * 0.17, -1.78, 0.4);
      elbow.add(knuckle);
    }
    const thumb = ellipsoid(0.12, 0.11, 0.19, M.face, 8);
    thumb.position.set(sx * 0.3, -1.66, 0.1);
    elbow.add(thumb);

    arm.rotation.set(0.12, 0, sx * 0.1);
    elbow.rotation.x = -0.18;
    rex.arms.push({ arm, elbow, sx });
  }
  rex.wings = [];
}
