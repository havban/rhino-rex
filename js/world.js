// The sunny arena: sky dome, grass, trees, boulders, clouds and distant hills.
import * as THREE from 'three';
import { WORLD, COLORS } from './config.js';

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

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6fbe46';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const t = Math.random();
    g.fillStyle = t < 0.4 ? 'rgba(96,180,64,0.9)'
      : t < 0.75 ? 'rgba(142,210,88,0.85)'
      : t < 0.92 ? 'rgba(74,152,52,0.8)'
      : 'rgba(236,226,122,0.5)';
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(34, 34);
  tex.anisotropy = 4;
  return tex;
}

export class World {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.obstacles = [];     // { pos: Vector3, radius, solid }
    this.quality = quality;
    this.time = 0;
    this._build();
  }

  _build() {
    const scene = this.scene;
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(0xcdeeff, WORLD.fogNear, WORLD.fogFar);

    // ---- sky dome -------------------------------------------------------
    this.sunDir = new THREE.Vector3(0.45, 0.62, -0.5).normalize();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x4fb8ff) },
          horizon: { value: new THREE.Color(0xfff0d0) },
          sunDir: { value: this.sunDir.clone() },
        },
      })
    );
    sky.frustumCulled = false;
    scene.add(sky);

    // ---- lights ---------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5d8e42, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.0);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    sun.castShadow = this.quality !== 'low';
    const s = 62;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 340;
    sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    scene.add(new THREE.AmbientLight(0xfff4e0, 0.22));

    // ---- ground ---------------------------------------------------------
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD.groundSize / 2, 64),
      new THREE.MeshLambertMaterial({ map: grassTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;

    // a warmer sun-lit patch in the middle of the arena, purely cosmetic
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD.radius * 0.55, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.02;
    scene.add(patch);

    this._scatterGrass();
    this._scatterProps();
    this._buildClouds();
    this._buildHills();
    this._buildFence();
  }

  _scatterGrass() {
    const count = this.quality === 'low' ? 900 : this.quality === 'medium' ? 2200 : 4200;
    const blade = new THREE.ConeGeometry(0.2, 0.85, 6, 1, true);
    blade.translate(0, 0.425, 0);
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
      col.setHSL(0.24 + Math.random() * 0.07, 0.62, 0.48 + Math.random() * 0.18);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.scene.add(mesh);

    // bright flowers for the cheerful look
    const fcount = this.quality === 'low' ? 140 : 420;
    const fgeo = new THREE.SphereGeometry(0.32, 9, 7);
    const fmesh = new THREE.InstancedMesh(fgeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), fcount);
    const petal = [0xff6f91, 0xffd93d, 0xff9f68, 0xf5f7ff, 0xc77dff];
    for (let i = 0; i < fcount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (WORLD.radius + 40);
      pos.set(Math.cos(a) * r, 0.5 + Math.random() * 0.4, Math.sin(a) * r);
      m.compose(pos, new THREE.Quaternion(), scl.set(1, 1, 1));
      fmesh.setMatrixAt(i, m);
      fmesh.setColorAt(i, col.setHex(petal[(Math.random() * petal.length) | 0]));
    }
    fmesh.instanceMatrix.needsUpdate = true;
    if (fmesh.instanceColor) fmesh.instanceColor.needsUpdate = true;
    this.scene.add(fmesh);
  }

  _tree(x, z, scale) {
    const g = new THREE.Group();
    const trunkH = 5 * scale;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * scale, 0.8 * scale, trunkH, 12),
      new THREE.MeshLambertMaterial({ color: 0xa9703f })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);
    const greens = [0x62c94a, 0x7fd65c, 0x4fb53d];
    for (let i = 0; i < 3; i++) {
      const r = (2.6 - i * 0.45) * scale;
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        new THREE.MeshLambertMaterial({ color: greens[i % greens.length], flatShading: true })
      );
      leaf.position.set((Math.random() - 0.5) * scale, trunkH + i * 1.5 * scale - 0.4, (Math.random() - 0.5) * scale);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    this.scene.add(g);
    this.obstacles.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.5 * scale, solid: true, kind: 'tree', mesh: g });
    return g;
  }

  _rock(x, z, scale) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(scale, 1),
      new THREE.MeshLambertMaterial({ color: 0xb9b0a2, flatShading: true })
    );
    rock.position.set(x, scale * 0.55, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.y = 0.75;
    rock.castShadow = true; rock.receiveShadow = true;
    this.scene.add(rock);
    this.obstacles.push({ pos: new THREE.Vector3(x, 0, z), radius: scale * 0.95, solid: true, kind: 'rock', mesh: rock });
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
      this._tree(Math.cos(a) * r, Math.sin(a) * r, 0.9 + Math.random() * 1.1);
    }
  }

  _buildClouds() {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdfefff, emissiveIntensity: 0.35 });
    const n = this.quality === 'low' ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group();
      const puffs = 3 + ((Math.random() * 3) | 0);
      for (let p = 0; p < puffs; p++) {
        const r = 6 + Math.random() * 7;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
        puff.position.set((p - puffs / 2) * r * 0.9, Math.random() * r * 0.35, Math.random() * r * 0.4);
        puff.scale.y = 0.62;
        c.add(puff);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 230;
      c.position.set(Math.cos(a) * r, 55 + Math.random() * 45, Math.sin(a) * r);
      c.userData.drift = 0.5 + Math.random() * 1.2;
      group.add(c);
    }
    this.clouds = group;
    this.scene.add(group);
  }

  _buildHills() {
    const group = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.12;
      const r = 250 + Math.random() * 80;
      const h = 28 + Math.random() * 55;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(38 + Math.random() * 40, h, 12),
        new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.28, 0.35, 0.52 + Math.random() * 0.12), flatShading: true })
      );
      hill.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
      group.add(hill);
    }
    group.traverse((o) => { o.frustumCulled = true; });
    this.scene.add(group);
  }

  _buildFence() {
    // Low wooden posts marking the arena edge — a visual cue, not a hard wall.
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xd9a86c });
    const geo = new THREE.CylinderGeometry(0.28, 0.32, 3.2, 10);
    const n = 88;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const post = new THREE.Mesh(geo, mat);
      post.position.set(Math.cos(a) * WORLD.radius, 1.5, Math.sin(a) * WORLD.radius);
      post.rotation.z = (Math.random() - 0.5) * 0.12;
      post.castShadow = true;
      group.add(post);
    }
    this.scene.add(group);
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

  update(dt) {
    this.time += dt;
    if (this.clouds) {
      for (const c of this.clouds.children) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 340) c.position.x = -340;
      }
    }
  }
}
