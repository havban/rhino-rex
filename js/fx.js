// Particles (flame, dust, embers, sparks), floating damage numbers and camera shake.
import * as THREE from 'three';
import { BLOOD } from './config.js';

function sprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX = 1400;

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  // one fat blob plus a few satellites, so no two splats look alike
  const blob = (x, y, r) => {
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const rr = r * (0.72 + Math.random() * 0.45);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  blob(64, 64, 34);
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, d = 34 + Math.random() * 22;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + Math.random() * 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Pool of flat blood marks lying on the grass, faded out over time.
// One instanced draw call; unused slots keep alpha 0 and are discarded.
class Splats {
  constructor(scene, max) {
    this.max = max;
    this.cursor = 0;
    this.any = false;
    this.age = new Float32Array(max);
    this.live = new Uint8Array(max);

    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAlpha', this.alpha);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: splatTexture() }, tint: { value: new THREE.Color(BLOOD.colorDark) } },
      vertexShader: `
        attribute float iAlpha;
        varying vec2 vUv;
        varying float vA;
        void main() {
          vUv = uv; vA = iAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 tint;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float a = texture2D(map, vUv).a * vA;
          if (a < 0.012) discard;
          gl_FragColor = vec4(tint, a);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = max;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const id = new THREE.Matrix4();
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._axis = new THREE.Vector3(0, 1, 0);
  }

  add(x, z, scale) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.age[i] = 0;
    this.live[i] = 1;
    this.any = true;
    this._q.setFromAxisAngle(this._axis, Math.random() * Math.PI * 2);
    this._p.set(x, 0.05 + (i % 6) * 0.0015, z);
    this._s.set(scale, 1, scale);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.array[i] = 0.7;
    this.alpha.needsUpdate = true;
  }

  update(dt) {
    if (!this.any) return;
    let dirty = false, live = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.live[i]) continue;
      live++;
      this.age[i] += dt;
      const u = this.age[i] / BLOOD.splatLife;
      if (u >= 1) { this.live[i] = 0; this.alpha.array[i] = 0; dirty = true; continue; }
      const a = 0.7 * Math.min(1, (1 - u) * 2.4);
      if (Math.abs(a - this.alpha.array[i]) > 0.004) { this.alpha.array[i] = a; dirty = true; }
    }
    if (dirty) this.alpha.needsUpdate = true;
    if (!live) this.any = false;
  }

  clear() {
    this.live.fill(0);
    this.alpha.array.fill(0);
    this.alpha.needsUpdate = true;
    this.any = false;
  }
}

export class FX {
  constructor(scene, camera, overlay) {
    this.scene = scene;
    this.camera = camera;
    this.overlay = overlay;
    this.shakeAmount = 0;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setDrawRange(0, 0);

    const tex = sprite();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: innerHeight * 0.5 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a < 0.02) discard;
          gl_FragColor = vec4(vColor, 1.0) * t.a;
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.mat = mat;

    // particle bookkeeping (plain arrays, pooled)
    this.p = [];
    for (let i = 0; i < MAX; i++) {
      this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 0, c0: new THREE.Color(), c1: new THREE.Color(), drag: 1, grav: 0, blood: false });
    }
    this.cursor = 0;
    this.count = 0;

    // flickering light that follows the flame
    this.fireLight = new THREE.PointLight(0xff9a3c, 0, 40, 2);
    this.fireLight.visible = false;
    scene.add(this.fireLight);

    this.splats = new Splats(scene, BLOOD.splatMax);
    this.gore = true;          // toggled from the menu

    this._numbers = [];
    this._v = new THREE.Vector3();
  }

  _spawn(opts) {
    let tries = 0;
    let part = null;
    while (tries++ < MAX) {
      const cand = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      if (!cand.alive) { part = cand; break; }
    }
    if (!part) part = this.p[this.cursor];
    Object.assign(part, { alive: true, life: 0, blood: false }, opts);
    return part;
  }

  flame(origin, dir, dt = 1 / 60, power = 1) {
    const n = Math.max(3, Math.round(360 * dt));
    for (let i = 0; i < n; i++) {
      const spread = 0.2;
      const vx = dir.x + (Math.random() - 0.5) * spread;
      const vy = dir.y + (Math.random() - 0.5) * spread + 0.05;
      const vz = dir.z + (Math.random() - 0.5) * spread;
      const speed = 34 + Math.random() * 18;
      // spread the burst across the frame's time slice, otherwise low frame
      // rates spit out visible clumps instead of a continuous jet
      const t0 = Math.random() * dt;
      this._spawn({
        x: origin.x + (Math.random() - 0.5) * 0.5 + vx * speed * t0,
        y: origin.y + (Math.random() - 0.5) * 0.5 + vy * speed * t0,
        z: origin.z + (Math.random() - 0.5) * 0.5 + vz * speed * t0,
        vx: vx * speed, vy: vy * speed + 1.5, vz: vz * speed,
        max: 0.55 + Math.random() * 0.45,
        s0: 1.6 + Math.random() * 1.4, s1: 8.5 + Math.random() * 5,
        c0: new THREE.Color(0xffce6e), c1: new THREE.Color(0xff3405),
        drag: 0.982, grav: -5.0, life: t0 * 0.5,
      });
    }
    if (Math.random() < dt * 26) {
      this._spawn({
        x: origin.x, y: origin.y, z: origin.z,
        vx: dir.x * 8 + (Math.random() - 0.5) * 4, vy: 5 + Math.random() * 3, vz: dir.z * 8 + (Math.random() - 0.5) * 4,
        max: 1.1 + Math.random(), s0: 3, s1: 9,
        c0: new THREE.Color(0x4a3a30), c1: new THREE.Color(0x120d0a),
        drag: 0.95, grav: 1.2,
      });
    }
    this.fireLight.visible = true;
    this.fireLight.intensity = (26 + Math.random() * 14) * power;
    this.fireLight.position.copy(origin).addScaledVector(dir, 4);
  }

  stopFlame() {
    this.fireLight.visible = false;
    this.fireLight.intensity = 0;
  }

  /** Trail left behind a flying fireball (does not touch the breath light). */
  trail(p, dt) {
    const n = Math.max(1, Math.round(150 * dt));
    for (let i = 0; i < n; i++) {
      const t0 = Math.random() * dt;
      this._spawn({
        x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + (Math.random() - 0.5) * 0.5, z: p.z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
        max: 0.32 + Math.random() * 0.3, s0: 1.5 + Math.random(), s1: 5 + Math.random() * 3,
        c0: new THREE.Color(0xffd27a), c1: new THREE.Color(0xff3a08),
        drag: 0.93, grav: 1.5, life: t0 * 0.4,
      });
    }
  }

  /** The fireball going off: flash, fireball cloud, smoke and debris. */
  blast(p) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 1.2;
      const sp = 8 + Math.random() * 20;
      this._spawn({
        x: p.x, y: p.y + 0.2, z: p.z,
        vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.9 + 3, vz: Math.sin(a) * Math.cos(b) * sp,
        max: 0.5 + Math.random() * 0.55, s0: 2.5 + Math.random() * 2, s1: 11 + Math.random() * 6,
        c0: new THREE.Color(0xfff3c4), c1: new THREE.Color(0xff3505),
        drag: 0.9, grav: 3.5,
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn({
        x: p.x, y: p.y, z: p.z,
        vx: Math.cos(a) * (3 + Math.random() * 7), vy: 3 + Math.random() * 6, vz: Math.sin(a) * (3 + Math.random() * 7),
        max: 1.3 + Math.random() * 0.9, s0: 4, s1: 14,
        c0: new THREE.Color(0x4a3a30), c1: new THREE.Color(0x14100d),
        drag: 0.93, grav: 1.4,
      });
    }
    this.dustBurst(p.clone().setY(0.25), 18, 1.5);
    this.ring(p.clone().setY(0.3), 0xffb23d);
    for (let i = 0; i < 14; i++) this.ember(p.clone());
  }

  ember(p) {
    this._spawn({
      x: p.x + (Math.random() - 0.5) * 1.6, y: p.y, z: p.z + (Math.random() - 0.5) * 1.6,
      vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2,
      max: 0.55 + Math.random() * 0.4, s0: 0.9, s1: 0.1,
      c0: new THREE.Color(0xffc247), c1: new THREE.Color(0xff3a08),
      drag: 0.96, grav: 1.5,
    });
  }

  dust(p, scale = 1) {
    this._spawn({
      x: p.x + (Math.random() - 0.5) * 1.5 * scale, y: p.y + Math.random() * 0.5, z: p.z + (Math.random() - 0.5) * 1.5 * scale,
      vx: (Math.random() - 0.5) * 4, vy: 1.2 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 4,
      max: 0.7 + Math.random() * 0.6, s0: 1.4 * scale, s1: 5 * scale,
      c0: new THREE.Color(0xd9c9a3), c1: new THREE.Color(0x8d7f66),
      drag: 0.93, grav: -0.6,
    });
  }

  dustBurst(p, n = 12, scale = 1) {
    for (let i = 0; i < n; i++) this.dust(p, scale);
  }

  impact(p, color = 0xffd166, n = 14) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * 1.6;
      const sp = 7 + Math.random() * 14;
      this._spawn({
        x: p.x, y: p.y, z: p.z,
        vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + 3, vz: Math.sin(a) * Math.cos(b) * sp,
        max: 0.32 + Math.random() * 0.3, s0: 1.6, s1: 0.2,
        c0: new THREE.Color(0xffffff), c1: c,
        drag: 0.9, grav: -14,
      });
    }
  }

  /** Spray of droplets from a wound; each one stains the grass where it lands. */
  blood(p, dir = null, count = BLOOD.dropsPerHit, force = 1) {
    if (!this.gore) { this.impact(p, 0xff6b7a, Math.round(count * 0.6)); return; }
    const c0 = new THREE.Color(BLOOD.color);
    const c1 = new THREE.Color(BLOOD.colorDark);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 6 * force;
      const out = (2.5 + Math.random() * 7) * force;
      const vx = Math.cos(a) * out + (dir ? dir.x * 6 * force : 0);
      const vz = Math.sin(a) * out + (dir ? dir.z * 6 * force : 0);
      this._spawn({
        x: p.x, y: p.y, z: p.z,
        vx, vy: up, vz,
        max: 1.6, s0: 0.42 + Math.random() * 0.4, s1: 0.32 + Math.random() * 0.3,
        c0, c1, drag: 0.995, grav: -26, blood: true,
      });
    }
  }

  ring(p, color = 0xffe08a) {
    // a quick expanding ring of sparks — reads well for the tail sweep
    const c = new THREE.Color(color);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this._spawn({
        x: p.x, y: p.y + 0.4, z: p.z,
        vx: Math.cos(a) * 20, vy: 2.5, vz: Math.sin(a) * 20,
        max: 0.36, s0: 1.4, s1: 0.2,
        c0: new THREE.Color(0xffffff), c1: c,
        drag: 0.88, grav: -6,
      });
    }
  }

  shake(amount) { this.shakeAmount = Math.min(2.4, this.shakeAmount + amount); }

  number(worldPos, text, cls = '') {
    if (!this.overlay) return;
    const el = document.createElement('div');
    el.className = `dmg ${cls}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this._numbers.push({ el, p: worldPos.clone(), t: 0, ox: (Math.random() - 0.5) * 26 });
  }

  update(dt) {
    this.splats.update(dt);
    const pos = this.pos, col = this.col, size = this.size;
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const q = this.p[i];
      if (!q.alive) continue;
      q.life += dt;
      const u = q.life / q.max;
      if (u >= 1) { q.alive = false; continue; }
      q.vy += q.grav * dt;
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) {
        if (q.blood) {
          this.splats.add(q.x, q.z, 0.45 + Math.random() * 0.85);
          q.alive = false;
          continue;
        }
        q.y = 0.05; q.vy = Math.abs(q.vy) * 0.2; q.vx *= 0.7; q.vz *= 0.7;
      }
      const j = n * 3;
      pos[j] = q.x; pos[j + 1] = q.y; pos[j + 2] = q.z;
      const fade = 1 - u;
      col[j] = (q.c0.r + (q.c1.r - q.c0.r) * u) * fade;
      col[j + 1] = (q.c0.g + (q.c1.g - q.c0.g) * u) * fade;
      col[j + 2] = (q.c0.b + (q.c1.b - q.c0.b) * u) * fade;
      size[n] = q.s0 + (q.s1 - q.s0) * u;
      n++;
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.mat.uniforms.scale.value = innerHeight * 0.5;

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.6);

    // floating damage numbers
    for (let i = this._numbers.length - 1; i >= 0; i--) {
      const d = this._numbers[i];
      d.t += dt;
      if (d.t > 0.95) { d.el.remove(); this._numbers.splice(i, 1); continue; }
      this._v.copy(d.p);
      this._v.y += d.t * 3.2;
      this._v.project(this.camera);
      if (this._v.z > 1) { d.el.style.opacity = '0'; continue; }
      const x = (this._v.x * 0.5 + 0.5) * innerWidth + d.ox;
      const y = (-this._v.y * 0.5 + 0.5) * innerHeight;
      d.el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${1 + (1 - d.t) * 0.35})`;
      d.el.style.opacity = String(Math.max(0, 1 - d.t / 0.95));
    }
  }
}
