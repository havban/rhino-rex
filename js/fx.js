// Particles (flame, dust, embers, sparks), floating damage numbers and camera shake.
import * as THREE from 'three';

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
      this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 0, c0: new THREE.Color(), c1: new THREE.Color(), drag: 1, grav: 0 });
    }
    this.cursor = 0;
    this.count = 0;

    // flickering light that follows the flame
    this.fireLight = new THREE.PointLight(0xff9a3c, 0, 40, 2);
    this.fireLight.visible = false;
    scene.add(this.fireLight);

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
    Object.assign(part, { alive: true, life: 0 }, opts);
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

  blood(p) { this.impact(p, 0xff5577, 10); }

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
      if (q.y < 0.05) { q.y = 0.05; q.vy = Math.abs(q.vy) * 0.2; q.vx *= 0.7; q.vz *= 0.7; }
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
