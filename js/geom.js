// Helpers for building smooth, organic bodies out of maths instead of boxes.
import * as THREE from 'three';

// Smooth scalar curve through a table of { z, v } control points (Catmull-Rom).
export function makeProfile(points) {
  const pts = points.slice().sort((a, b) => a.z - b.z);
  const last = pts.length - 1;
  return (z) => {
    if (z <= pts[0].z) return pts[0].v;
    if (z >= pts[last].z) return pts[last].v;
    let i = 0;
    while (i < last && pts[i + 1].z < z) i++;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, last)];
    const t = (z - p1.z) / (p2.z - p1.z);
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1.v) +
      (-p0.v + p2.v) * t +
      (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2 +
      (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3);
  };
}

/**
 * A closed tube swept along the Z axis with a varying elliptical cross-section.
 * Optionally writes skinning attributes for a chain of bones laid out along Z,
 * so the same mesh can bend as a neck, a torso and a tail.
 *
 * opts:
 *   zStart, zEnd, rings, radial
 *   radius(z)      -> tube radius
 *   squash(z)      -> { x, y } multipliers on the radius
 *   center(z)      -> vertical offset of the cross-section centre
 *   color(z, a, p) -> THREE.Color for the vertex (a = angle, p = point)
 *   boneZ          -> [{ z, index }] sorted by z; enables skin attributes
 */
export function tubeAlongZ(opts) {
  const {
    zStart, zEnd, rings = 48, radial = 16,
    radius, squash = () => ({ x: 1, y: 1 }), center = () => 0,
    color = null, boneZ = null,
  } = opts;

  const pos = [], col = [], idx = [], si = [], sw = [];
  const stride = radial + 1;
  const tmpColor = new THREE.Color();

  const pushSkin = (z) => {
    if (!boneZ) return;
    let i = 0;
    while (i < boneZ.length - 1 && boneZ[i + 1].z < z) i++;
    const a = boneZ[i];
    const b = boneZ[Math.min(i + 1, boneZ.length - 1)];
    let w = 0;
    if (b !== a) w = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
    si.push(a.index, b.index, 0, 0);
    sw.push(1 - w, w, 0, 0);
  };

  for (let i = 0; i <= rings; i++) {
    const z = THREE.MathUtils.lerp(zStart, zEnd, i / rings);
    const r = radius(z);
    const s = squash(z);
    const cy = center(z);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const x = Math.cos(a) * r * s.x;
      const y = cy + Math.sin(a) * r * s.y;
      pos.push(x, y, z);
      if (color) { color(z, a, tmpColor); col.push(tmpColor.r, tmpColor.g, tmpColor.b); }
      pushSkin(z);
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * stride + j, b = a + 1, c = a + stride + 1, d = a + stride;
      idx.push(a, b, c, a, c, d);
    }
  }

  // end caps, so the body is water-tight from every angle
  for (const end of [0, 1]) {
    const z = end ? zEnd : zStart;
    const cy = center(z);
    const base = pos.length / 3;
    pos.push(0, cy, z);
    if (color) { color(z, -Math.PI / 2, tmpColor); col.push(tmpColor.r, tmpColor.g, tmpColor.b); }
    pushSkin(z);
    const ring = end ? rings * stride : 0;
    for (let j = 0; j < radial; j++) {
      if (end) idx.push(base, ring + j, ring + j + 1);
      else idx.push(base, ring + j + 1, ring + j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (boneZ) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// --- small smooth primitives -------------------------------------------------

export function ellipsoid(rx, ry, rz, mat, seg = 18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg - 6)), mat);
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

export function capsule(radius, length, mat, seg = 14) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, seg), mat);
  m.castShadow = true;
  return m;
}

export function cone(radius, height, mat, seg = 12) {
  const geo = new THREE.ConeGeometry(radius, height, seg, 3);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function skinMaterial(color, opts = {}) {
  return new THREE.MeshPhongMaterial({
    color, shininess: 16, specular: 0x2a2018, flatShading: false, ...opts,
  });
}
