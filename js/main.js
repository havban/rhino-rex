// Rhino Rex — game bootstrap, loop, waves and combat resolution.
import * as THREE from 'three';
import { REX, ATTACK, WAVES, WORLD, CAMERA, RHINO } from './config.js';
import { World } from './world.js';
import { Rex } from './rex.js';
import { Rhino, spawnRing } from './rhino.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { ChaseCamera } from './camera.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const IDLE_INPUT = { move: { x: 0, y: 0 }, sprint: false, consume: () => false };

class Game {
  constructor() {
    this.canvas = $('scene');
    this.quality = localStorage.getItem('rr.quality') || (matchMedia('(max-width: 900px)').matches ? 'medium' : 'high');
    this.soundOn = localStorage.getItem('rr.sound') !== 'off';

    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    // phones ship 3x screens that no mobile GPU wants to fill at 60fps
    this.prCap = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
    if (this.coarse) this.prCap = Math.min(this.prCap, 1.5);
    this.prScale = 1;
    this.renderer.setPixelRatio(this.prCap);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.4, 900);
    this.chase = new ChaseCamera(this.camera);

    this.world = new World(this.scene, this.quality);
    this.rex = new Rex(this.scene);
    this.fx = new FX(this.scene, this.camera, $('fx-layer'));
    this.audio = new Audio();
    this.audio.setEnabled(this.soundOn);
    this.input = new Input(this.canvas);
    this.input.onModeChange = (touch) => {
      $('touch').classList.toggle('on', touch);
      document.body.classList.toggle('is-touch', touch);
    };
    // touch-first on phones and tablets; hybrid laptops start in mouse mode and
    // switch the moment a finger lands on the screen
    if (this.input.hasTouch && this.coarse) { this.input.touchActive = true; this.input.onModeChange(true); }

    this.rhinos = [];
    this.pickups = [];
    this.state = 'menu';
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.best = Number(localStorage.getItem('rr.best') || 0);
    this.restTimer = 0;
    this.time = 0;
    this.wantFullscreen = false;
    this.clock = new THREE.Clock();

    this._bindUI();
    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    visualViewport?.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause(true);
    });
    this.input.onUnlock = () => {
      document.body.classList.remove('locked');
      if (this.state === 'playing') this.pause(true);
    };
    this.input.onLock = () => document.body.classList.add('locked');

    this.chase.orbit(0, this.rex, 0);
    this.renderer.compile(this.scene, this.camera);
    requestAnimationFrame(() => this._loop());
  }

  // ---------------------------------------------------------------- UI ----
  _bindUI() {
    $('btn-start').addEventListener('click', () => this.start());
    $('btn-restart').addEventListener('click', () => this.start());
    $('btn-resume').addEventListener('click', () => this.pause(false));
    $('btn-quit').addEventListener('click', () => this.toMenu());
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('btn-pause').addEventListener('click', () => this.pause(true));

    const fs = $('btn-fullscreen');
    const paintFs = () => { fs.textContent = document.fullscreenElement ? '⛶ Keluar layar penuh' : '⛶ Layar penuh'; };
    fs.addEventListener('click', () => {
      if (document.fullscreenElement) { this.wantFullscreen = false; document.exitFullscreen?.(); }
      else { this.wantFullscreen = true; this._goFullscreen(); }
    });
    document.addEventListener('fullscreenchange', paintFs);
    paintFs();
    $('btn-help-close').addEventListener('click', () => $('help').classList.add('hidden'));

    const sound = $('btn-sound');
    const paintSound = () => { sound.textContent = this.soundOn ? '🔊 Suara: ON' : '🔇 Suara: OFF'; };
    paintSound();
    sound.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.audio.setEnabled(this.soundOn);
      localStorage.setItem('rr.sound', this.soundOn ? 'on' : 'off');
      paintSound();
    });

    const q = $('sel-quality');
    q.value = this.quality;
    q.addEventListener('change', () => {
      localStorage.setItem('rr.quality', q.value);
      location.reload();
    });

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause(true);
        else if (this.state === 'paused') this.pause(false);
      }
      if (e.code === 'Enter' && (this.state === 'menu' || this.state === 'dead')) this.start();
    });

    $('best-menu').textContent = this.best.toLocaleString('id-ID');

    const rotate = $('rotate');
    rotate?.addEventListener('click', () => rotate.classList.add('dismissed'));
  }

  _resize() {
    const w = Math.round(visualViewport?.width || innerWidth);
    const h = Math.round(visualViewport?.height || innerHeight);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // keep a sane horizontal field of view on tall phone screens
    this.camera.fov = aspect < 1 ? THREE.MathUtils.clamp(CAMERA.fov / Math.max(aspect, 0.45), CAMERA.fov, 80) : CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    // short landscape screens (phones on their side) want a little more room too
    this.zoom = aspect < 1.0 ? 1.18 : h < 460 ? 1.1 : 1;
    document.body.classList.toggle('is-short', h < 460);
    document.body.classList.toggle('is-portrait', aspect < 1);
  }

  // Drop resolution if the device cannot keep up, and creep back when it can.
  _adaptResolution(dt) {
    if (dt <= 0 || this.state !== 'playing') return;
    this._frameAvg = this._frameAvg ? this._frameAvg * 0.93 + dt * 0.07 : dt;
    this._slow = (this._slow || 0) + (this._frameAvg > 1 / 42 ? dt : -dt * 0.5);
    this._slow = clamp(this._slow, 0, 4);
    this._fast = (this._fast || 0) + (this._frameAvg < 1 / 57 ? dt : -dt);
    this._fast = clamp(this._fast, 0, 8);
    if (this._slow > 1.6 && this.prScale > 0.62) {
      this.prScale = Math.max(0.62, this.prScale - 0.14);
      this.renderer.setPixelRatio(this.prCap * this.prScale);
      this._slow = 0; this._fast = 0;
    } else if (this._fast > 6 && this.prScale < 1) {
      this.prScale = Math.min(1, this.prScale + 0.12);
      this.renderer.setPixelRatio(this.prCap * this.prScale);
      this._fast = 0;
    }
  }

  // ------------------------------------------------------------- flow ----
  start() {
    this.audio.init();
    this.audio.resume();
    for (const r of this.rhinos) if (!r.dead) r.dispose();
    this.rhinos.length = 0;
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups.length = 0;

    this.rex.hp = REX.maxHp;
    this.rex.fire = REX.maxFire;
    this.rex.alive = true;
    this.rex.pos.set(0, 0, 14);
    this.rex.vel.set(0, 0, 0);
    this.rex.y = 0; this.rex.vy = 0;
    this.rex.yaw = Math.PI;
    this.rex.resetPose();
    this.rex.attack = null;
    this.rex.combo = 0;
    this.chase.yaw = Math.PI;
    this.chase.pitch = 0.12;

    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.restTimer = 2.2;
    this.state = 'playing';
    document.body.classList.add('playing');
    $('menu').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (this.input.touchActive) this.wantFullscreen = true;
    this._goFullscreen();
    this.input.requestLock();
    this.banner('SIAP!', 'Badak datang…');
  }

  // Phones drop out of fullscreen whenever the app is backgrounded, so the
  // resume button has to ask for it again (it is a user gesture, so it works).
  _goFullscreen() {
    if (!this.wantFullscreen || document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }

  toMenu() {
    this.state = 'menu';
    document.body.classList.remove('playing');
    document.exitPointerLock?.();
    $('menu').classList.remove('hidden');
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('best-menu').textContent = this.best.toLocaleString('id-ID');
  }

  pause(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.rex.breathing = false;
      this.audio.flame(false);
      this.fx.stopFlame();
      $('pause').classList.remove('hidden');
      document.exitPointerLock?.();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      $('pause').classList.add('hidden');
      this._goFullscreen();
      this.input.requestLock();
    }
  }

  gameOver() {
    this.state = 'dead';
    this.rex.breathing = false;
    this.audio.flame(false);
    this.fx.stopFlame();
    this.audio.death();
    this.best = Math.max(this.best, this.score);
    localStorage.setItem('rr.best', String(this.best));
    $('go-score').textContent = this.score.toLocaleString('id-ID');
    $('go-wave').textContent = String(Math.max(1, this.wave));
    $('go-kills').textContent = String(this.kills);
    $('go-best').textContent = this.best.toLocaleString('id-ID');
    $('gameover').classList.remove('hidden');
    document.exitPointerLock?.();
  }

  banner(title, sub = '') {
    const b = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  // ------------------------------------------------------------ waves ----
  nextWave() {
    this.wave++;
    const plan = WAVES.composition(this.wave);
    const pts = spawnRing(plan.length, this.rex.pos);
    plan.forEach((key, i) => {
      const r = new Rhino(this.scene, key, pts[i]);
      r.yaw = Math.atan2(this.rex.pos.x - pts[i].x, this.rex.pos.z - pts[i].z);
      this.rhinos.push(r);
    });
    const boss = plan.includes('matriarch');
    this.banner(`GELOMBANG ${this.wave}`, boss ? '⚠️ MATRIARK BADAK MUNCUL!' : `${plan.length} badak menyerbu`);
    this.audio.wave();
  }

  livingRhinos() { return this.rhinos.filter((r) => r.alive); }

  // ----------------------------------------------------------- combat ----
  coneHit(type) {
    const cfg = ATTACK[type];
    const origin = this.rex.pos.clone().setY(this.rex.y + 2.2);
    const fwd = this.rex.forward;
    let hits = 0;
    for (const r of this.livingRhinos()) {
      const to = r.pos.clone().sub(origin).setY(0);
      const d = to.length() - r.radius;
      if (d > cfg.range) continue;
      to.normalize();
      if (fwd.dot(to) < Math.cos(cfg.halfAngle)) continue;
      const opts = { knock: to, knockStrength: cfg.knockback };
      if (type === 'tail') opts.stun = cfg.stun;
      const dealt = r.takeDamage(cfg.damage, opts);
      this._registerHit(r, dealt, type);
      hits++;
    }
    if (type === 'tail') {
      this.fx.ring(this.rex.pos.clone().setY(0.6), 0xffd98a);
      this.fx.dustBurst(this.rex.pos.clone().setY(0.3), 14, 1.2);
      this.fx.shake(0.45);
    }
    if (hits) { this.fx.shake(type === 'tail' ? 0.5 : 0.3); this.audio.crunch(); }
    return hits;
  }

  // Yaw towards the closest rhino, so a tail swing turns onto a real target.
  _aimYaw(maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const r of this.livingRhinos()) {
      const dx = r.pos.x - this.rex.pos.x, dz = r.pos.z - this.rex.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = r; }
    }
    return best ? Math.atan2(best.pos.x - this.rex.pos.x, best.pos.z - this.rex.pos.z) : null;
  }

  // Grit kicked up by the pivoting feet while the body spins.
  _spinDust(dt) {
    const a = this.rex.attack;
    if (!a || a.type !== 'tail') return;
    const cfg = ATTACK.tail;
    if (a.t < cfg.windup * 0.5 || a.t > cfg.windup + cfg.active) return;
    if (Math.random() < dt * 40) {
      const ang = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 2.2;
      this.fx.dust(new THREE.Vector3(this.rex.pos.x + Math.cos(ang) * r, 0.15, this.rex.pos.z + Math.sin(ang) * r), 0.8);
    }
  }

  fireTick(dt) {
    const cfg = ATTACK.fire;
    const origin = this.rex.mouthPosition;
    const aim = this.rex.forward.clone();
    aim.y = -0.24;                       // the jet sprays down towards the herd
    aim.normalize();
    this.fx.flame(origin, aim, dt, 1);

    // Damage uses a flat cone from the body: the mouth sits high up, so a
    // strict 3D cone would sail straight over anything standing close.
    const flat = this.rex.pos.clone().setY(0);
    const fwd = this.rex.forward;
    const cosHalf = Math.cos(cfg.halfAngle);
    for (const r of this.livingRhinos()) {
      const to = r.pos.clone().setY(0).sub(flat);
      const d = to.length() - r.radius;
      if (d > cfg.range) continue;
      to.normalize();
      if (d > 0.5 && fwd.dot(to) < cosHalf) continue;
      const dealt = r.takeDamage(cfg.dps * dt, { burn: { time: cfg.burnTime, dps: cfg.burnDps } });
      this._fireAccum = (this._fireAccum || 0) + dealt;
      r._fireTally = (r._fireTally || 0) + dealt;
      if (r._fireTally > 22) { this.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(r._fireTally), 'burn'); r._fireTally = 0; }
      if (!r.alive) this._onKill(r, 'fire');
    }
  }

  _registerHit(r, dealt, type) {
    const cls = type === 'bite' ? 'bite' : type === 'tail' ? 'tail' : '';
    this.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(dealt), cls);
    this.fx.impact(r.pos.clone().setY(2.4 * r.scaleF), type === 'bite' ? 0xff88a0 : 0xffe08a, type === 'bite' ? 16 : 10);
    if (!r.alive) this._onKill(r, type);
  }

  _onKill(r, cause) {
    if (r._counted) return;
    r._counted = true;
    this.kills++;
    this.rex.combo++;
    this.rex.comboTimer = 4.0;
    const mult = 1 + Math.min(this.rex.combo - 1, 9) * 0.1;
    this.score += Math.round(r.cfg.score * mult);
    this.fx.impact(r.pos.clone().setY(2.2 * r.scaleF), 0xffc247, 26);
    this.fx.dustBurst(r.pos.clone().setY(0.4), 12, r.scaleF);
    this.fx.number(r.pos.clone().setY(5.2 * r.scaleF), `+${Math.round(r.cfg.score * mult)}`, 'score');
    this.fx.shake(r.cfg.boss ? 1.4 : 0.35);
    this.audio.snort();
    if (r.cfg.boss || Math.random() < 0.22) this._dropPickup(r.pos.clone());
    if (this.rex.combo > 0 && this.rex.combo % 5 === 0) this.banner(`COMBO ×${this.rex.combo}`, 'Badak berjatuhan!');
  }

  _dropPickup(pos) {
    const g = new THREE.Group();
    const melon = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 22, 16),
      new THREE.MeshLambertMaterial({ color: 0x5ec84f, emissive: 0x1d4a18, emissiveIntensity: 0.4 })
    );
    g.add(melon);
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 10, 28, Math.PI), new THREE.MeshLambertMaterial({ color: 0x2e7a26 }));
      stripe.rotation.y = (i / 4) * Math.PI;
      stripe.rotation.x = Math.PI / 2;
      g.add(stripe);
    }
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.7, 20),
      new THREE.MeshBasicMaterial({ color: 0xa8ff9a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.85;
    g.add(halo);
    g.position.copy(pos).setY(1.3);
    this.scene.add(g);
    this.pickups.push({ mesh: g, t: 0, life: 22 });
  }

  // -------------------------------------------------------------- loop ----
  _update(dt) {
    this.time += dt;
    this.world.update(dt);
    this.world.followSun(this.rex.pos);
    this.fx.update(dt);
    this._updatePickups(dt);

    const input = this.input;
    input.sample();
    const look = input.consumeLook();
    if (this.state === 'playing') this.chase.handleLook(look.dx, look.dy);

    if (this.state !== 'playing') {
      if (this.state === 'menu') this.chase.orbit(dt, this.rex, this.time);
      else this.chase.update(dt, this.rex, this.world, this.fx.shakeAmount, this.zoom, null);
      if (this.state !== 'paused') this.rex.update(dt, IDLE_INPUT, this.chase.yaw, this.world);
      for (const r of this.rhinos) if (!r.dead) r.faceBar(this.camera.quaternion);
      return;
    }

    // ---- fire breath ----
    const wantsFire = input.fire && this.rex.canBreathe();
    if (wantsFire && !this.rex.breathing) { this.rex.breathing = true; this.audio.flame(true); }
    if ((!input.fire || !this.rex.alive || this.rex.fire <= 0) && this.rex.breathing) {
      this.rex.breathing = false; this.audio.flame(false); this.fx.stopFlame();
    }
    if (!this.rex.breathing) this.fx.stopFlame();

    // ---- melee input ----
    if (input.consume('bite') && this.rex.startAttack('bite')) this.audio.bite();
    if (input.consume('tail') && this.rex.startAttack('tail', this._aimYaw(ATTACK.tail.aimRange))) {
      this.audio.tail();
    }
    this._spinDust(dt);

    const hitEvent = this.rex.update(dt, input, this.chase.yaw, this.world);
    if (hitEvent) this.coneHit(hitEvent);
    if (this.rex.breathing) this.fireTick(dt);

    // ---- enemies ----
    const hpBefore = this.rex.hp;
    for (const r of this.rhinos) r.update(dt, this.rex, this.world, this.rhinos, this.fx);
    for (const r of this.rhinos) { if (!r.alive && !r._counted && !r.dead) this._onKill(r, 'dot'); if (!r.dead) r.faceBar(this.camera.quaternion); }
    for (let i = this.rhinos.length - 1; i >= 0; i--) if (this.rhinos[i].dead) this.rhinos.splice(i, 1);
    if (this.rex.hp < hpBefore) { this.audio.hurt(); this._flashVignette(); }

    // ---- wave flow ----
    if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.nextWave();
    } else if (this.livingRhinos().length === 0 && this.rhinos.every((r) => !r.alive)) {
      this.restTimer = WAVES.restBetween;
      this.rex.heal(18);
      this.banner(`GELOMBANG ${this.wave} AMAN!`, 'Pulih sebentar…');
      this.score += 120 * this.wave;
    }

    this.chase.update(dt, this.rex, this.world, this.fx.shakeAmount, this.zoom, input.move);
    if (!this.rex.alive) this.gameOver();
    this._updateHud();
  }

  _updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.life -= dt;
      p.mesh.rotation.y += dt * 1.6;
      p.mesh.position.y = 1.3 + Math.sin(p.t * 3) * 0.22;
      const d = p.mesh.position.distanceTo(this.rex.pos);
      if (d < 4.2 && this.state === 'playing' && this.rex.alive) {
        this.rex.heal(26);
        this.rex.fire = Math.min(REX.maxFire, this.rex.fire + 30);
        this.fx.impact(p.mesh.position.clone(), 0x9dff8a, 20);
        this.fx.number(p.mesh.position.clone(), '+26 HP', 'heal');
        this.audio.pickup();
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      } else if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  _flashVignette() {
    const v = $('vignette');
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
  }

  _updateHud() {
    const hp = clamp(this.rex.hp / REX.maxHp, 0, 1);
    const fire = clamp(this.rex.fire / REX.maxFire, 0, 1);
    $('bar-hp').style.transform = `scaleX(${hp})`;
    $('bar-hp').style.background = hp > 0.5 ? 'linear-gradient(90deg,#7bf07a,#39c95b)' : hp > 0.25 ? 'linear-gradient(90deg,#ffd36b,#ff9f43)' : 'linear-gradient(90deg,#ff8a8a,#e74040)';
    $('bar-fire').style.transform = `scaleX(${fire})`;
    $('txt-hp').textContent = Math.ceil(this.rex.hp);
    $('txt-wave').textContent = String(Math.max(1, this.wave));
    $('txt-score').textContent = this.score.toLocaleString('id-ID');
    const left = this.livingRhinos().length;
    $('txt-left').textContent = this.restTimer > 0 ? `istirahat ${Math.ceil(this.restTimer)}s` : `${left} badak`;
    const combo = $('combo');
    if (this.rex.combo >= 2) {
      combo.classList.add('show');
      combo.textContent = `COMBO ×${this.rex.combo}`;
    } else combo.classList.remove('show');

    const bite = String(1 - this.rex.cooldown.bite / ATTACK.bite.cooldown);
    const tail = String(1 - this.rex.cooldown.tail / ATTACK.tail.cooldown);
    for (const [id, v] of [['cd-bite', bite], ['cd-tail', tail], ['cd-fire', String(fire)],
                           ['tb-bite', bite], ['tb-tail', tail], ['tb-fire', String(fire)]]) {
      $(id)?.style.setProperty('--cd', v);
    }
    $('cd-fire').classList.toggle('empty', this.rex.fire <= REX.fireMinToStart);
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    let dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'paused') dt = 0;
    this._adaptResolution(dt);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
game.cfg = { REX, ATTACK, WAVES, WORLD, CAMERA, RHINO };
window.__game = game;      // handy for debugging and automated tests
