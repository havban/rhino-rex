// The arena: sky dome, ground, trees, boulders, clouds and distant hills.
// Everything is driven by an entry in ARENAS, so a new place to fight is a
// palette and a handful of style switches rather than a new file.
import * as THREE from 'three';
import { WORLD, SCENERY, ARENAS } from './config.js';

const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
varying vec3 vWorld;
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
void main() {
  vec3 d = normalize(vWorld);
  float h = clamp(d.y * 1.15 + 0.08, 0.0, 1.0);
  vec3 col = mix(horizon, top, pow(h, 0.72));
  float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 220.0);
  float glow = pow(max(dot(d, normalize(sunDir)), 0.0), 8.0) * 0.22;
  col += vec3(1.0, 0.96, 0.82) * (sun * 1.4 + glow);
  gl_FragColor = vec4(col, 1.0);
}`;

// Four weighted fleck colours over a base fill: grass, basalt or swamp mud,
// depending only on the palette handed in.
function groundTexture(ground) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = ground.base;
  g.fillRect(0, 0, 256, 256);
  const f = ground.flecks;
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const t = Math.random();
    g.fillStyle = t < 0.4 ? f[0] : t < 0.75 ? f[1] : t < 0.92 ? f[2] : f[3];
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(34, 34);
  tex.anisotropy = 4;
  return tex;
}

export const ARENA_NAMES = Object.keys(ARENAS);

export class World {
  constructor(scene, quality = 'high', arena = 'padang') {
    this.scene = scene;
    this.obstacles = [];     // { pos: Vector3, radius, solid }
    this.quality = quality;
    this.arena = ARENAS[arena] ? arena : 'padang';
    this.a = ARENAS[this.arena];
    this.time = 0;
    // Everything the arena owns hangs off one group, so swapping arenas is a
    // remove-and-dispose rather than a page reload.
    this.root = new THREE.Group();
    scene.add(this.root);
    this._build();
  }

  /** Free every geometry and material this arena made, and unhook it. */
  dispose() {
    const seen = new Set();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    this.scene.remove(this.root);
    this.obstacles.length = 0;
    this.scene.fog = null;
  }

  _build() {
    const a = this.a;
    const root = this.root;
    this.scene.background = new THREE.Color(a.background);
    this.scene.fog = new THREE.Fog(a.fog.color, a.fog.near, a.fog.far);

    // ---- sky dome -------------------------------------------------------
    this.sunDir = new THREE.Vector3(...a.sun.dir).normalize();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(a.sky.top) },
          horizon: { value: new THREE.Color(a.sky.horizon) },
          sunDir: { value: this.sunDir.clone() },
        },
      })
    );
    sky.frustumCulled = false;
    root.add(sky);

    // ---- lights ---------------------------------------------------------
    root.add(new THREE.HemisphereLight(a.hemi.sky, a.hemi.ground, a.hemi.intensity));
    const sun = new THREE.DirectionalLight(a.sun.color, a.sun.intensity);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    sun.castShadow = this.quality !== 'low';
    const s = 62;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 340;
    sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.6;
    root.add(sun);
    root.add(sun.target);
    this.sun = sun;
    root.add(new THREE.AmbientLight(a.ambient.color, a.ambient.intensity));

    // ---- ground ---------------------------------------------------------
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD.groundSize / 2, 64),
      new THREE.MeshLambertMaterial({ map: groundTexture(a.ground) })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    this.ground = ground;

    // a warmer sun-lit patch in the middle of the arena, purely cosmetic
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD.radius * 0.55, 48),
      new THREE.MeshBasicMaterial({ color: a.patch.color, transparent: true, opacity: a.patch.opacity, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.02;
    root.add(patch);

    this._scatterGrass();
    this._buildPools();
    this._scatterProps();
    this._buildClouds();
    this._buildHills();
    this._buildFence();
  }

  _scatterGrass() {
    const b = this.a.blades;
    const base = this.quality === 'low' ? 900 : this.quality === 'medium' ? 2200 : 4200;
    const count = Math.max(1, Math.round(base * b.density));
    const blade = new THREE.ConeGeometry(0.2 * b.width, 0.85 * b.height, 6, 1, true);
    blade.translate(0, 0.425 * b.height, 0);
    blade.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (WORLD.groundSize / 2 - 6);
      pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      e.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
      q.setFromEuler(e);
      const sc = 0.55 + Math.random() * 0.8;
      scl.set(sc, sc * (0.7 + Math.random() * 0.8), sc);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      col.setHSL(b.hue + Math.random() * b.spread, b.sat, b.light + Math.random() * 0.18);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.root.add(mesh);

    this._scatterMotes();
  }

  /**
   * The little bright things: meadow flowers sitting still, volcanic embers
   * drifting up, swamp fireflies bobbing. One instanced mesh either way; the
   * moving ones get animated in update().
   */
  _scatterMotes() {
    const spec = this.a.motes;
    if (!spec) return;
    const count = Math.max(1, Math.round((this.quality === 'low' ? 140 : 420) * spec.density));
    const lit = spec.kind !== 'flower';
    const geo = new THREE.SphereGeometry(0.32 * spec.size, 9, 7);
    const mat = lit
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
      : new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const seeds = new Float32Array(count * 4);     // x, z, phase, speed
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (WORLD.radius + 40);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = spec.kind === 'ember' ? Math.random() * 14
        : spec.kind === 'firefly' ? 1.2 + Math.random() * 3.4
        : 0.5 + Math.random() * 0.4;
      seeds[i * 4] = x; seeds[i * 4 + 1] = z;
      seeds[i * 4 + 2] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 3] = 0.6 + Math.random() * 0.9;
      pos.set(x, y, z);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(spec.colors[(Math.random() * spec.colors.length) | 0]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.motes = spec.kind === 'flower' ? null : { mesh, seeds, kind: spec.kind, m, q, scl, pos };
  }

  /** Lava pools or swamp water: flat discs that glow or shimmer. Cosmetic. */
  _buildPools() {
    const spec = this.a.pools;
    this.pools = null;
    if (!spec) return;
    const group = new THREE.Group();
    for (let i = 0; i < spec.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * (WORLD.radius + 30);
      const size = (4 + Math.random() * 9) * spec.size;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(size, 18),
        new THREE.MeshBasicMaterial({
          color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false,
        })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(Math.cos(a) * r, 0.03 + i * 0.001, Math.sin(a) * r);
      disc.scale.set(1, 0.6 + Math.random() * 0.7, 1);
      disc.userData.phase = Math.random() * Math.PI * 2;
      disc.userData.base = spec.opacity;
      group.add(disc);
    }
    this.root.add(group);
    this.pools = group;
  }

  // Repeated tree parts share one geometry each - a mangrove has five roots
  // and there are sixty-odd trees, which is a lot of buffers otherwise.
  _rootGeo() {
    this._geoRoot ||= new THREE.CylinderGeometry(0.1, 0.26, 2.4, 6);
    return this._geoRoot;
  }

  _branchGeo() {
    this._geoBranch ||= new THREE.CylinderGeometry(0.06, 0.17, 2.4, 5);
    return this._geoBranch;
  }

  /**
   * A tree in the arena's own style: a leafy meadow tree, a burnt-out
   * volcanic snag, or a mangrove standing on its roots. All three keep the
   * same trunk/canopy parts so burning, toppling and regrowing work unchanged.
   */
  _tree(x, z, scale, destructible = true) {
    const t = this.a.tree;
    const g = new THREE.Group();
    const trunkH = (t.style === 'charred' ? 5.6 : 5) * scale;
    const bark = new THREE.MeshLambertMaterial({ color: t.bark, flatShading: t.style !== 'leafy' });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry((t.style === 'charred' ? 0.3 : 0.45) * scale, 0.8 * scale, trunkH, 12),
      bark
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);

    // mangroves stand on a flare of stilt roots
    if (t.style === 'mangrove') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
        const root = new THREE.Mesh(this._rootGeo(), bark);
        root.scale.setScalar(scale);
        root.position.set(Math.cos(a) * 0.9 * scale, 0.95 * scale, Math.sin(a) * 0.9 * scale);
        root.rotation.set(Math.cos(a) * 0.42, 0, -Math.sin(a) * 0.42);
        root.castShadow = true;
        g.add(root);
      }
    }

    const leaves = [];
    if (t.style === 'charred') {
      // no canopy: bare branches, so the crater reads as burnt out
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const branch = new THREE.Mesh(
          this._branchGeo(),
          new THREE.MeshLambertMaterial({ color: t.leaves[i % t.leaves.length], flatShading: true })
        );
        branch.scale.set(scale, scale * (0.75 + Math.random() * 0.6), scale);
        branch.position.set(Math.cos(a) * 0.5 * scale, trunkH * (0.62 + i * 0.16), Math.sin(a) * 0.5 * scale);
        branch.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
        branch.castShadow = true;
        g.add(branch);
        leaves.push(branch);
      }
    } else {
      const wide = t.style === 'mangrove' ? 1.06 : 1;
      for (let i = 0; i < 3; i++) {
        const r = (2.6 - i * 0.45) * scale * wide;
        const leaf = new THREE.Mesh(
          new THREE.IcosahedronGeometry(r, 1),
          new THREE.MeshLambertMaterial({ color: t.leaves[i % t.leaves.length], flatShading: true })
        );
        leaf.position.set((Math.random() - 0.5) * scale, trunkH + i * (t.style === 'mangrove' ? 1.05 : 1.5) * scale - 0.4, (Math.random() - 0.5) * scale);
        if (t.style === 'mangrove') leaf.scale.y = 0.66;     // low, spreading canopy
        leaf.castShadow = true;
        g.add(leaf);
        leaves.push(leaf);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    this.root.add(g);

    if (!destructible) return g;

    // the charred stump that stays behind, hidden until the tree comes down
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6 * scale, 0.85 * scale, 0.9 * scale, 10),
      new THREE.MeshLambertMaterial({ color: t.stump, flatShading: true })
    );
    stump.position.set(x, 0.45 * scale, z);
    stump.castShadow = true;
    stump.visible = false;
    this.root.add(stump);

    this.obstacles.push({
      pos: new THREE.Vector3(x, 0, z), radius: 1.5 * scale, solid: true, kind: 'tree',
      mesh: g, stump, bark, leaves, scale,
      hp: SCENERY.treeHp * scale, maxHp: SCENERY.treeHp * scale,
      alive: true, burn: 0, phase: 0,
    });
    return g;
  }

  _rock(x, z, scale) {
    const r = this.a.rock;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(scale, 1),
      new THREE.MeshLambertMaterial({
        color: r.color, flatShading: true,
        emissive: new THREE.Color(r.emissive), emissiveIntensity: r.glow,
      })
    );
    rock.position.set(x, scale * 0.55, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.75, 1);
    rock.castShadow = true; rock.receiveShadow = true;
    this.root.add(rock);

    const rubble = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale * (0.11 + Math.random() * 0.11), 0),
        rock.material
      );
      const a = Math.random() * Math.PI * 2, d = scale * (0.35 + Math.random() * 0.85);
      chunk.position.set(Math.cos(a) * d, scale * 0.07, Math.sin(a) * d);
      chunk.scale.y = 0.6;
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      chunk.castShadow = true;
      rubble.add(chunk);
    }
    rubble.position.set(x, 0, z);
    rubble.visible = false;
    this.root.add(rubble);

    this.obstacles.push({
      pos: new THREE.Vector3(x, 0, z), radius: scale * 0.95, solid: true, kind: 'rock',
      mesh: rock, stump: rubble, scale,
      hp: SCENERY.rockHp * scale * 0.7, maxHp: SCENERY.rockHp * scale * 0.7,
      alive: true, burn: 0, phase: 0, baseY: scale * 0.55,
    });
    return rock;
  }

  _scatterProps() {
    const placed = [];
    const ok = (x, z, minD) => {
      if (Math.hypot(x, z) < 22) return false;           // keep the spawn clearing open
      return placed.every((p) => Math.hypot(p.x - x, p.z - z) > minD);
    };
    let guard = 0;
    while (placed.length < 26 && guard++ < 900) {
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * (WORLD.radius - 26);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z, 16)) continue;
      placed.push({ x, z });
      this._tree(x, z, 0.85 + Math.random() * 0.8);
    }
    guard = 0;
    let rocks = 0;
    while (rocks < 18 && guard++ < 900) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * (WORLD.radius - 22);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z, 12)) continue;
      placed.push({ x, z });
      this._rock(x, z, 1.4 + Math.random() * 2.2);
      rocks++;
    }
    // a few decorative trees far outside the arena
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = WORLD.radius + 12 + Math.random() * 55;
      this._tree(Math.cos(a) * r, Math.sin(a) * r, 0.9 + Math.random() * 1.1, false);
    }
  }

  _buildClouds() {
    const c = this.a.clouds;
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: c.color, emissive: c.emissive, emissiveIntensity: c.intensity });
    const n = Math.max(3, Math.round((this.quality === 'low' ? 10 : 22) * c.density));
    for (let i = 0; i < n; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + ((Math.random() * 3) | 0);
      for (let p = 0; p < puffs; p++) {
        const r = 6 + Math.random() * 7;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
        puff.position.set((p - puffs / 2) * r * 0.9, Math.random() * r * 0.35, Math.random() * r * 0.4);
        puff.scale.y = c.flat;
        cloud.add(puff);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 230;
      cloud.position.set(Math.cos(a) * r, c.y + Math.random() * 45, Math.sin(a) * r);
      cloud.userData.drift = 0.5 + Math.random() * 1.2;
      group.add(cloud);
    }
    this.clouds = group;
    this.root.add(group);
  }

  _buildHills() {
    const hl = this.a.hills;
    const group = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.12;
      const r = 250 + Math.random() * 80;
      const h = (28 + Math.random() * 55) * hl.height;
      const rad = (38 + Math.random() * 40) * hl.width;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(rad, h, 12),
        new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hl.hue, hl.sat, hl.light + Math.random() * 0.12), flatShading: true })
      );
      hill.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
      group.add(hill);
      // a few of the volcanoes are lit at the crater
      if (hl.cap && Math.random() < 0.3) {
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(rad * 0.3, h * 0.16, 10),
          new THREE.MeshBasicMaterial({ color: hl.cap })
        );
        cap.position.set(hill.position.x, hill.position.y + h * 0.44, hill.position.z);
        group.add(cap);
      }
    }
    group.traverse((o) => { o.frustumCulled = true; });
    this.root.add(group);
  }

  _buildFence() {
    // A ring marking the arena edge — a visual cue, not a hard wall. Wooden
    // posts in the meadow and the swamp, obsidian shards in the crater.
    const f = this.a.fence;
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: f.color, flatShading: f.style === 'shard' });
    const geo = f.style === 'shard'
      ? new THREE.ConeGeometry(0.55, 4.2, 5)
      : new THREE.CylinderGeometry(0.28, 0.32, 3.2, 10);
    const n = 88;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const post = new THREE.Mesh(geo, mat);
      post.position.set(Math.cos(a) * WORLD.radius, f.style === 'shard' ? 2.1 : 1.5, Math.sin(a) * WORLD.radius);
      post.rotation.z = (Math.random() - 0.5) * (f.style === 'shard' ? 0.3 : 0.12);
      post.rotation.y = Math.random() * Math.PI;
      post.castShadow = true;
      group.add(post);
    }
    this.root.add(group);
  }

  // Push a circle of `radius` out of any solid prop it overlaps.
  resolve(pos, radius) {
    let hit = null;
    for (const o of this.obstacles) {
      if (!o.solid) continue;
      const dx = pos.x - o.pos.x, dz = pos.z - o.pos.z;
      const min = radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
        hit = o;
      }
    }
    // soft arena wall
    const rr = Math.hypot(pos.x, pos.z);
    const lim = WORLD.radius - radius;
    if (rr > lim) {
      pos.x *= lim / rr;
      pos.z *= lim / rr;
      hit = hit || { kind: 'wall' };
    }
    return hit;
  }

  // Keep the shadow frustum centred on the action so it stays sharp.
  followSun(target) {
    if (!this.sun) return;
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.position.copy(this.sunDir).multiplyScalar(120).add(this.sun.target.position);
  }

  /**
   * Hurt a tree or boulder. Returns true if this blow finished it off.
   * `kind` only picks the flavour of the effects; damage is already scaled.
   */
  damage(o, amount, kind, fx) {
    if (!o || !o.alive || o.kind === 'wall' || o.hp === undefined) return false;
    o.hp -= amount;
    o.flash = 0.35;
    if (kind === 'fire') o.burn = SCENERY.burnTime;
    if (fx) {
      const at = o.pos.clone().setY(o.kind === 'tree' ? 2.2 * o.scale : o.scale * 0.8);
      if (o.kind === 'tree') fx.leaves(at, 5, 1.8 * o.scale);
      else fx.debris(at, 5, o.scale * 0.5);
    }
    if (o.hp > 0) return false;
    this._fell(o, fx);
    return true;
  }

  _fell(o, fx) {
    o.alive = false;
    o.solid = false;                       // you can run straight through it now
    o.burn = 0;
    o.fall = 0;
    o.respawn = o.kind === 'tree' ? SCENERY.respawnTree : SCENERY.respawnRock;
    o.tipAxis = Math.random() * Math.PI * 2;
    if (!fx) return;
    const at = o.pos.clone().setY(o.kind === 'tree' ? 2.6 * o.scale : o.scale * 0.6);
    if (o.kind === 'tree') {
      fx.leaves(at, 26, 2.6 * o.scale);
      fx.dustBurst(o.pos.clone().setY(0.3), 14, o.scale);
    } else {
      fx.debris(at, 22, o.scale * 0.8);
    }
    fx.shake(0.5);
  }

  /** Topple / crumble, then regrow after a while. */
  _updateScenery(dt, fx) {
    for (const o of this.obstacles) {
      if (o.hp === undefined) continue;
      o.phase += dt;

      if (o.flash > 0 || o._lit) {
        o.flash = Math.max(0, (o.flash || 0) - dt * 2);
        const v = o.flash * 0.5;
        o.mesh.traverse((m) => { if (m.isMesh && m.material.emissive) m.material.emissive.setRGB(v, v * 0.7, 0); });
        o._lit = o.flash > 0;
      }

      if (o.alive && o.burn > 0) {
        o.burn -= dt;
        o.hp -= SCENERY.burnDps * dt;
        if (fx && Math.random() < dt * 12) {
          fx.ember(o.pos.clone().setY(1.5 * o.scale + Math.random() * 2.5 * o.scale));
        }
        // char the whole tree as it burns, so "this one is going down" is
        // obvious at a glance
        const left = Math.max(0, o.hp / o.maxHp);
        if (o.bark) o.bark.color.setHSL(0.07, 0.45, 0.1 + 0.2 * left);
        if (o.leaves) {
          const tint = this.a.tree.leaves;
          for (let i = 0; i < o.leaves.length; i++) {
            const leaf = o.leaves[i];
            leaf.material.color.setHex(tint[i % tint.length]);
            leaf.material.color.multiplyScalar(0.25 + 0.75 * left);
          }
        }
        if (fx && Math.random() < dt * 6) {
          fx.flame(o.pos.clone().setY(1.2 * o.scale + Math.random() * 2.6 * o.scale),
            new THREE.Vector3((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4), dt * 0.5, 0.35);
        }
        if (o.hp <= 0) this._fell(o, fx);
        continue;
      }

      if (o.alive) {
        if (o.grow !== undefined) {           // coming back up
          o.grow += dt;
          const u = Math.min(o.grow / SCENERY.growTime, 1);
          const e = (1 - Math.pow(1 - u, 3)) * (1 + Math.sin(u * Math.PI) * 0.12);
          const squash = o.kind === 'rock' ? 0.75 : 1;   // boulders sit flatter
          o.mesh.scale.set(e, e * squash, e);
          if (u >= 1) { o.mesh.scale.set(1, squash, 1); o.grow = undefined; }
        }
        continue;
      }

      // --- down and out ---
      if (o.fall < SCENERY.fallTime) {
        o.fall += dt;
        const u = Math.min(o.fall / SCENERY.fallTime, 1);
        if (o.kind === 'tree') {
          const lean = Math.pow(u, 1.6) * Math.PI * 0.52;
          o.mesh.rotation.x = Math.cos(o.tipAxis) * lean;
          o.mesh.rotation.z = Math.sin(o.tipAxis) * lean;
          if (u > 0.75) o.mesh.scale.setScalar(Math.max(0, 1 - (u - 0.75) * 4));
        } else {
          o.mesh.scale.set(1 + u * 0.3, Math.max(0.02, 0.75 - u * 0.8), 1 + u * 0.3);
          o.mesh.position.y = o.baseY * Math.max(0, 1 - u * 1.4);
        }
        if (u >= 1) {
          o.mesh.visible = false;
          if (o.stump) o.stump.visible = true;
        }
        continue;
      }

      o.respawn -= dt;
      if (o.respawn > 0) continue;

      // --- back again ---
      o.alive = true;
      o.solid = true;
      o.hp = o.maxHp;
      o.fall = 0;
      o.grow = 0;
      o.mesh.visible = true;
      o.mesh.rotation.x = 0;
      o.mesh.rotation.z = 0;
      o.mesh.scale.setScalar(0.01);
      if (o.leaves) {
        const tint = this.a.tree.leaves;
        o.leaves.forEach((leaf, i) => leaf.material.color.setHex(tint[i % tint.length]));
      }
      if (o.kind === 'rock') {
        o.mesh.scale.set(0.01, 0.0075, 0.01);
        o.mesh.position.y = o.baseY;
      }
      if (o.stump) o.stump.visible = false;
      if (o.bark) o.bark.color.setHex(this.a.tree.bark);
      if (fx) fx.dustBurst(o.pos.clone().setY(0.3), 10, o.scale);
    }
  }

  update(dt, fx) {
    this._updateScenery(dt, fx);
    this.time += dt;
    if (this.clouds) {
      for (const c of this.clouds.children) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 340) c.position.x = -340;
      }
    }
    this._updateMotes();
    if (this.pools) {
      for (const d of this.pools.children) {
        const u = 0.82 + 0.18 * Math.sin(this.time * 1.4 + d.userData.phase);
        d.material.opacity = d.userData.base * u;
      }
    }
  }

  /** Embers climb and loop back down; fireflies bob and weave. */
  _updateMotes() {
    const mo = this.motes;
    if (!mo) return;
    const { mesh, seeds, kind, m, q, scl, pos } = mo;
    const t = this.time;
    for (let i = 0; i < seeds.length / 4; i++) {
      const x = seeds[i * 4], z = seeds[i * 4 + 1];
      const phase = seeds[i * 4 + 2], speed = seeds[i * 4 + 3];
      let y, dx = 0, dz = 0;
      if (kind === 'ember') {
        y = ((t * speed * 2.6 + phase * 3) % 18);
        dx = Math.sin(t * 0.8 + phase) * 1.2;
        dz = Math.cos(t * 0.6 + phase) * 1.2;
      } else {
        y = 1.6 + Math.sin(t * speed + phase) * 1.1;
        dx = Math.sin(t * 0.5 * speed + phase) * 2.2;
        dz = Math.cos(t * 0.42 * speed + phase * 1.7) * 2.2;
      }
      pos.set(x + dx, y, z + dz);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
