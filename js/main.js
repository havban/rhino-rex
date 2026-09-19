// Rhino Rex — game bootstrap, loop, waves and combat resolution.
//
// Copyright (C) 2026 havban
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version. It is distributed in the hope that it will be
// useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
// General Public License for more details: <https://www.gnu.org/licenses/>.
//
// Because this is played over a network, section 13 applies: anyone
// interacting with a modified version must be offered its Corresponding
// Source. The menu carries a source link pointing at the exact deployed
// commit, which is how that obligation is met here - keep it working.
import * as THREE from 'three';
import { REX, ATTACK, WAVES, WORLD, CAMERA, RHINO, FIREBALL, IMPACT, SCENERY, PROGRESS, ITEMS, ARENAS } from './config.js';
import { World } from './world.js';
import { Rex } from './rex.js';
import { Rhino, spawnRing } from './rhino.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { ChaseCamera } from './camera.js';
import { Audio } from './audio.js';
import { Music } from './music.js';
import { Fireball } from './fireball.js';
import { Mine } from './mine.js';
import * as Scores from './scores.js';
import * as Stats from './analytics.js';
import * as Update from './update.js';
import * as Global from './leaderboard.js';
import { Net } from './net.js';
import { Session } from './multiplayer.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const IDLE_INPUT = { move: { x: 0, y: 0 }, sprint: false, consume: () => false };
const ATTACK_KEYS = ['bite', 'tail', 'fireball'];

/** Buckets a join error so the dashboard shows why people fail to connect. */
function joinFailure(message = '') {
  const m = message.toLowerCase();
  if (m.includes('tidak ditemukan')) return 'kode-salah';
  if (m.includes('ditutup')) return 'room-tutup';
  if (m.includes('penuh')) return 'room-penuh';
  if (m.includes('tidak merespons')) return 'tuan-rumah-diam';
  if (m.includes('fetch') || m.includes('network') || m.includes('failed')) return 'jaringan';
  return 'lain';
}
const INPUT_BUFFER = 0.28;      // seconds an unusable attack press is held for

class Game {
  constructor() {
    this.canvas = $('scene');
    this.quality = localStorage.getItem('rr.quality') || (matchMedia('(max-width: 900px)').matches ? 'medium' : 'high');
    this.soundOn = localStorage.getItem('rr.sound') !== 'off';
    this.musicStyle = localStorage.getItem('rr.music') || 'ceria';
    this.arena = ARENAS[localStorage.getItem('rr.arena')] ? localStorage.getItem('rr.arena') : 'padang';

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

    this.world = new World(this.scene, this.quality, this.arena);
    this.rex = new Rex(this.scene);
    this.fx = new FX(this.scene, this.camera, $('fx-layer'));
    this.audio = new Audio();
    this.audio.setEnabled(this.soundOn);
    this.music = null;          // built lazily: needs an AudioContext
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
    this.balls = [];
    this.mines = [];
    this.item = null;              // the one item you are carrying
    this.lastItem = null;          // biases the next roll away from a repeat
    this.state = 'menu';
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.best = Number(localStorage.getItem('rr.best') || 0);
    this.restTimer = 0;
    this.time = 0;
    this.wantFullscreen = false;
    this.run = null;                 // per-run tally, folded into the stats on death
    this.mp = null;                  // co-op session, null when playing solo
    this._respawn = 0;
    this._pickupId = 0;
    this._buffered = { bite: 0, tail: 0, fireball: 0 };
    this.clock = new THREE.Clock();

    this._bindUI();
    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    visualViewport?.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._saveRun();
        if (this.state === 'playing') this.pause(true);
        this._silence();
      } else {
        this._wake();
      }
    });
    // pagehide is the reliable one on mobile: it fires when the tab is closed,
    // swiped away or frozen, where unload often does not.
    addEventListener('pagehide', () => { this._saveRun(); this._silence(); });
    addEventListener('pageshow', (e) => { if (e.persisted) this._wake(); });
    this.input.onUnlock = () => {
      document.body.classList.remove('locked');
      if (this.state === 'playing') this.pause(true);
    };
    this.input.onLock = () => document.body.classList.add('locked');

    Stats.install();     // GoatCounter counts the page view itself
    Stats.pageview();
    Stats.trackVisitor();
    Stats.once(this.coarse ? 'device-touch' : 'device-desktop',
      this.coarse ? 'Perangkat sentuh' : 'Perangkat desktop');
    if (/[?&]stats=1/.test(location.search)) Stats.mountPanel();
    window.__stats = () => Stats.mountPanel();

    Update.stampSourceLink('https://github.com/havban/rhino-rex');

    // tell the player when a newer build has gone out
    Update.watch((build) => {
      this._newBuild = build;
      $('update-toast').classList.remove('hidden');
      Stats.event('update-available', 'Versi baru terdeteksi');
    });

    this.chase.orbit(0, this.rex, 0);
    this.renderer.compile(this.scene, this.camera);
    requestAnimationFrame(() => this._loop());
  }

  // ---------------------------------------------------------------- UI ----
  _bindUI() {
    $('btn-start').addEventListener('click', () => { this._clearRun(); this.start(); });
    $('btn-resume-run').addEventListener('click', () => {
      const saved = this._loadRun();
      if (saved) this.start(saved);
    });
    $('btn-revive').addEventListener('click', () => this.takeRevive());
    $('btn-giveup').addEventListener('click', () => { $('revive').classList.add('hidden'); this.gameOver(); });
    $('btn-restart').addEventListener('click', () => { this._clearRun(); this.start(); });
    $('btn-resume').addEventListener('click', () => this.pause(false));
    $('btn-quit').addEventListener('click', () => this.toMenu());
    $('btn-reload').addEventListener('click', () => {
      Stats.event('reload-manual', 'Muat ulang manual');
      Update.reload(this._newBuild);
    });
    $('btn-update').addEventListener('click', () => {
      Stats.event('update-reloaded', 'Muat ulang ke versi baru');
      Update.reload(this._newBuild);
    });
    $('btn-help').addEventListener('click', () => {
      Stats.once('open-help', 'Membuka bantuan kontrol');
      $('help').classList.toggle('hidden');
    });
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
      if (this.soundOn) this._startMusic();
      paintSound();
    });

    $('btn-coop').addEventListener('click', () => {
      Stats.once('open-coop', 'Membuka lobi co-op');
      this.showLobby();
    });
    $('btn-lobby-close').addEventListener('click', () => { this.leaveCoop(); $('lobby').classList.add('hidden'); });
    $('btn-host').addEventListener('click', () => this.hostCoop());
    $('btn-join').addEventListener('click', () => this.joinCoop());
    $('btn-coop-start').addEventListener('click', () => {
      Stats.event(`coop-start-${Math.min(this.mp ? this.mp.playerCount : 1, 4)}p`, 'Memulai co-op');
      $('lobby').classList.add('hidden');
      this.start();
    });
    $('lobby-code').addEventListener('keydown', (e) => { if (e.code === 'Enter') this.joinCoop(); });

    $('btn-scores').addEventListener('click', () => {
      Stats.once('open-scores', 'Membuka papan skor');
      this.showScores();
    });
    $('btn-go-scores').addEventListener('click', () => this.showScores());
    $('btn-scores-close').addEventListener('click', () => $('scores').classList.add('hidden'));
    $('tab-global').addEventListener('click', () => this.showScores('global'));
    $('tab-local').addEventListener('click', () => this.showScores('local'));
    $('btn-scores-clear').addEventListener('click', () => {
      Scores.clear();
      this._scoreTab = 'local';
      this.showScores('local');
      this._paintBest();
    });
    $('btn-save-score').addEventListener('click', () => this.saveScore());
    $('go-name').addEventListener('keydown', (e) => { if (e.code === 'Enter') this.saveScore(); });

    // the same picker sits in the menu and on the pause card, so you can A/B
    // tracks mid-fight where the adaptive layers are actually audible
    this._musicPickers = [$('sel-music'), $('sel-music-2')].filter(Boolean);
    for (const el of this._musicPickers) {
      el.value = this.musicStyle;
      el.addEventListener('change', () => {
        this.musicStyle = el.value;
        localStorage.setItem('rr.music', this.musicStyle);
        for (const other of this._musicPickers) other.value = this.musicStyle;
        Stats.once(`music-${this.musicStyle}`, `Musik dipilih: ${this.musicStyle}`);
        this._startMusic(this.state !== 'playing');   // preview loudly from a menu
      });
    }

    const q = $('sel-quality');
    q.value = this.quality;
    q.addEventListener('change', () => {
      localStorage.setItem('rr.quality', q.value);
      location.reload();
    });

    const arena = $('sel-arena');
    for (const [key, cfg] of Object.entries(ARENAS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${cfg.glyph} ${cfg.label}`;
      arena.appendChild(opt);
    }
    arena.value = this.arena;
    arena.addEventListener('change', () => {
      this.setArena(arena.value);
      Stats.once(`arena-${this.arena}`, `Arena dipilih: ${ARENAS[this.arena].label}`);
    });

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause(true);
        else if (this.state === 'paused') this.pause(false);
      }
      if (e.code === 'Enter' && (this.state === 'menu' || this.state === 'dead')) this.start();
    });

    this._paintBest();
    this._paintResume();

    const rotate = $('rotate');
    rotate?.addEventListener('click', () => rotate.classList.add('dismissed'));
  }

  // ------------------------------------------------------------- co-op ----
  showLobby() {
    const ok = Global.available();
    $('lobby').classList.remove('hidden');
    $('lobby-offline').classList.toggle('hidden', ok);
    $('lobby-forms').classList.toggle('hidden', !ok);
    this._lobbyStatus(ok ? 'Buat room lalu bagikan kodenya, atau masukkan kode teman.' : '');
  }

  _lobbyStatus(text, kind = '') {
    const el = $('lobby-status');
    el.textContent = text;
    el.className = `status ${kind}`;
  }

  _lobbyRoster() {
    const names = [this.net?.self.name || 'Kamu'];
    if (this.mp) for (const p of this.mp.players.values()) names.push(p.name);
    $('lobby-roster').textContent = names.length > 1
      ? `Pemain: ${names.join(', ')}`
      : 'Pemain: kamu (menunggu teman…)';
    $('btn-coop-start').classList.toggle('hidden', !(this.mp && this.mp.isHost));
  }

  _newSession() {
    this.net = new Net(Global.base());
    this.net.onStatus = (text, kind) => { this._lobbyStatus(text, kind); this._lobbyRoster(); };
    this.mp = new Session(this, this.net);
    const join = this.net.onPeerJoin, leave = this.net.onPeerLeave;
    this.net.onPeerJoin = (p) => {
      join(p);
      // only meaningful on the host: a guest has not built the host's avatar
      // yet at this point, so its count would always read 1
      if (this.mp.isHost) {
        Stats.once(`coop-players-${Math.min(this.mp.playerCount, 4)}`, `Pemain tersambung: ${this.mp.playerCount}`);
      }
      this._lobbyRoster();
    };
    this.net.onPeerLeave = (p) => { leave(p); this._lobbyRoster(); };
    return this.mp;
  }

  async hostCoop() {
    Stats.event('coop-host-room', 'Membuat room');
    try {
      this._newSession();
      this.net.self.name = Scores.lastName() || 'Tuan rumah';
      const code = await this.net.host(this.net.self.name);
      $('lobby-mycode').textContent = code;
      $('lobby-mycode').parentElement.classList.remove('hidden');
      this._lobbyStatus(`Room ${code} siap. Bagikan kodenya, lalu tekan Mulai.`, 'good');
      this._lobbyRoster();
    } catch (err) {
      Stats.event('coop-host-fail', 'Gagal membuat room');
      this._lobbyStatus(`Gagal membuat room: ${err.message}`, 'bad');
      this.leaveCoop();
    }
  }

  async joinCoop() {
    const code = $('lobby-code').value.trim().toUpperCase();
    if (code.length < 4) { this._lobbyStatus('Masukkan kode 4 huruf.', 'bad'); return; }
    Stats.event('coop-join-try', 'Mencoba bergabung');
    try {
      this._newSession();
      this.net.self.name = Scores.lastName() || 'Tamu';
      this._lobbyStatus('Menyambung…');
      await this.net.join(code, this.net.self.name);
      Stats.event('coop-join-ok', 'Berhasil bergabung');
      this._lobbyStatus('Tersambung! Menunggu tuan rumah memulai…', 'good');
      this._lobbyRoster();
      this._waitForHost();
    } catch (err) {
      const why = joinFailure(err.message);
      Stats.event(`coop-join-fail-${why}`, `Gagal bergabung: ${why}`);
      this._lobbyStatus(`Gagal bergabung: ${err.message}`, 'bad');
      this.leaveCoop();
    }
  }

  /** Guests drop into the world as soon as the host's snapshots arrive. */
  _waitForHost() {
    const check = () => {
      if (!this.mp || this.mp.isHost) return;
      if (this.state !== 'playing' && this.mp.remoteWave) {
        $('lobby').classList.add('hidden');
        this.start();
        return;
      }
      setTimeout(check, 400);
    };
    setTimeout(check, 400);
  }

  leaveCoop() {
    if (!this.mp) return;
    this.mp.destroy();
    this.mp = null;
    this.net = null;
    $('lobby-mycode').parentElement.classList.add('hidden');
  }

  // ---------------------------------------------------- saved runs ----
  // Only the shape of the run is stored, not the world: resuming drops you at
  // the start of the wave you were on, with your score and kills intact. That
  // survives an update reload or a closed tab without pretending to restore
  // fifteen rhinos mid-charge.
  _saveRun() {
    if (this.state !== 'playing' || this.mp || this.wave < 1) return;
    try {
      localStorage.setItem(PROGRESS.key, JSON.stringify({
        wave: this.wave,
        score: this.score,
        kills: this.kills,
        hp: Math.round(this.rex.hp),
        fire: Math.round(this.rex.fire),
        revives: this._revives,
        weapons: this.run ? this.run.weapons : null,
        bosses: this.run ? this.run.bosses : 0,
        seconds: this.run ? Math.round((performance.now() - this.run.t0) / 1000) : 0,
        savedAt: Date.now(),
      }));
    } catch { /* private mode: not worth breaking the game over */ }
  }

  _loadRun() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROGRESS.key) || 'null');
      if (!raw || !raw.wave || raw.wave < 2) return null;
      if (Date.now() - (raw.savedAt || 0) > PROGRESS.maxAgeHours * 3600e3) return null;
      return raw;
    } catch {
      return null;
    }
  }

  _clearRun() {
    try { localStorage.removeItem(PROGRESS.key); } catch { /* ignore */ }
    $('btn-resume-run').classList.add('hidden');
  }

  _paintResume() {
    const saved = this._loadRun();
    const btn = $('btn-resume-run');
    btn.classList.toggle('hidden', !saved);
    if (saved) {
      btn.textContent = `▶ LANJUTKAN — GELOMBANG ${saved.wave} · ${saved.score.toLocaleString('id-ID')}`;
    }
    return saved;
  }

  _paintBest() {
    const top = Scores.list()[0];
    this.best = Math.max(Number(localStorage.getItem('rr.best') || 0), top ? top.score : 0);
    $('best-menu').textContent = this.best.toLocaleString('id-ID');
  }

  renderScores(host, highlight = -1, limit = Scores.MAX_ENTRIES) {
    this._renderRows(host, Scores.list().slice(0, limit), highlight);
  }

  _esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Draws rows from either board; `rows` uses the same shape for both. */
  _renderRows(host, rows, highlight = -1) {
    if (!rows.length) {
      host.innerHTML = '<p class="empty">Belum ada skor tersimpan. Berburulah!</p>';
      return;
    }
    const body = rows.map((e, i) => `
      <tr class="${i === highlight ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td class="nm">${this._esc(e.name)}</td>
        <td class="num">${Number(e.score).toLocaleString('id-ID')}</td>
        <td class="num">${e.wave}</td>
        <td class="num">${e.kills}</td>
      </tr>`).join('');
    host.innerHTML = `<table class="stable">
      <thead><tr><th></th><th>NAMA</th><th class="num">SKOR</th><th class="num">GEL.</th><th class="num">BADAK</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }

  async showScores(tab) {
    const screen = $('scores');
    const host = $('score-table');
    const note = $('score-note');
    screen.classList.remove('hidden');

    if (!tab) tab = this._scoreTab || (Global.available() ? 'global' : 'local');
    if (tab === 'global' && !Global.available()) tab = 'local';
    this._scoreTab = tab;
    $('tab-global').classList.toggle('on', tab === 'global');
    $('tab-local').classList.toggle('on', tab === 'local');
    $('btn-scores-clear').classList.toggle('hidden', tab !== 'local');

    if (tab === 'local') {
      this.renderScores(host, this._lastRank - 1);
      note.textContent = Global.available()
        ? 'Sepuluh perburuan terbaik di perangkat ini.'
        : 'Sepuluh perburuan terbaik di perangkat ini. Papan global belum aktif.';
      return;
    }

    host.innerHTML = '<p class="empty">Memuat papan global…</p>';
    note.textContent = '';
    const out = await Global.top(20);
    if (this._scoreTab !== 'global') return;              // player switched away
    if (!out.scores) {
      host.innerHTML = '<p class="empty">Papan global tidak bisa dimuat.</p>';
      note.textContent = `Gagal: ${out.error}. Coba papan perangkat ini.`;
      return;
    }
    if (!out.scores.length) {
      host.innerHTML = '<p class="empty">Papan global masih kosong — jadilah yang pertama!</p>';
      note.textContent = '';
      return;
    }
    this._renderRows(host, out.scores, this._globalRank - 1);
    note.textContent = 'Dua puluh perburuan terbaik dari semua pemain.';
  }

  async saveScore() {
    const btn = $('btn-save-score');
    const status = $('go-status');
    const name = $('go-name').value.trim() || 'Pemburu';
    Scores.rememberName(name);

    this._lastRank = Scores.add({ name, score: this.score, wave: Math.max(1, this.wave), kills: this.kills });
    this._pendingScore = false;
    $('go-entry').classList.add('hidden');
    this.renderScores($('go-table'), this._lastRank - 1, 5);
    this._paintBest();
    this.audio.pickup();

    if (!Global.available()) return;
    status.className = 'status';
    status.textContent = 'Mengirim ke papan global…';
    btn.disabled = true;
    const out = await Global.submit({
      name,
      score: this.score,
      wave: Math.max(1, this.wave),
      kills: this.kills,
      seconds: Math.round(this._lastRunSeconds || 0),
    });
    btn.disabled = false;
    if (out.rank) {
      Stats.event('score-submit-ok', 'Skor terkirim ke papan global');
      this._globalRank = out.rank;
      status.className = 'status good';
      status.textContent = `Masuk papan global di peringkat #${out.rank}!`;
    } else {
      Stats.event('score-submit-fail', 'Gagal mengirim skor');
      status.className = 'status bad';
      status.textContent = `Papan global gagal: ${out.error}. Skor tetap tersimpan di perangkat ini.`;
    }
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
    // screen pixels per world unit of height, at one unit of distance
    this._pxFactor = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
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
      Stats.once('perf-downscale', 'Resolusi diturunkan otomatis');
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
  start(saved = null) {
    this.audio.init();
    this.audio.resume();
    for (const r of this.rhinos) if (!r.dead) r.dispose();
    this.rhinos.length = 0;
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups.length = 0;
    for (const ball of this.balls) ball.dispose();
    this.balls.length = 0;
    for (const m of this.mines) m.dispose();
    this.mines.length = 0;
    this.item = null;
    this.rex.cooldown.fireball = 0;

    this.rex.hp = saved ? Math.max(saved.hp, 45) : REX.maxHp;
    this.rex.fire = saved ? saved.fire : REX.maxFire;
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

    this.wave = saved ? saved.wave - 1 : 0;
    this.score = saved ? saved.score : 0;
    this.kills = saved ? saved.kills : 0;
    this._revives = saved ? (saved.revives ?? PROGRESS.revivesPerRun) : PROGRESS.revivesPerRun;
    this._saveTimer = PROGRESS.autosaveEvery;
    this._respawn = 0;
    this.restTimer = this.mp && !this.mp.isHost ? 9e9 : 2.2;
    this.run = {
      t0: performance.now(),
      bosses: saved ? saved.bosses || 0 : 0,
      weapons: (saved && saved.weapons) || { bite: 0, tail: 0, fire: 0, fireball: 0 },
    };
    this._buffered = { bite: 0, tail: 0, fireball: 0 };
    Stats.event(saved ? 'run-resume' : 'run-start', saved ? 'Melanjutkan permainan' : 'Permainan dimulai');
    Stats.event(this.mp ? 'mode-coop' : 'mode-solo', this.mp ? 'Main bersama' : 'Main sendiri');
    Stats.once(`quality-${this.quality}`, `Grafis: ${this.quality}`);
    Stats.once(innerWidth < innerHeight ? 'screen-portrait' : 'screen-landscape',
      innerWidth < innerHeight ? 'Layar potret' : 'Layar lanskap');
    Global.beginRun();                 // fire and forget; failure just disables posting
    this.state = 'playing';
    document.body.classList.add('playing');
    $('menu').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('scores').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (this.input.touchActive) this.wantFullscreen = true;
    this._goFullscreen();
    this.input.requestLock();
    this._startMusic();
    this.banner(saved ? `GELOMBANG ${saved.wave}` : 'SIAP!', saved ? 'Perburuan dilanjutkan' : 'Badak datang…');
  }

  // Phones drop out of fullscreen whenever the app is backgrounded, so the
  // resume button has to ask for it again (it is a user gesture, so it works).
  /** Boots the audio context on demand and plays the chosen track. */
  /**
   * Swap arenas without reloading: the old World disposes its geometry and a
   * new one builds in its place. Safe mid-run - the arena only changes how
   * the place looks, never its size or the rules.
   */
  setArena(name, { remember = true, announce = true } = {}) {
    if (!ARENAS[name] || name === this.arena) return;
    this.arena = name;
    if (remember) localStorage.setItem('rr.arena', name);
    this.world.dispose();
    this.world = new World(this.scene, this.quality, name);
    const picker = $('sel-arena');
    if (picker && picker.value !== name) picker.value = name;
    if (announce && this.state === 'playing') this.banner(ARENAS[name].label.toUpperCase(), 'Arena berganti');
  }

  /**
   * Leaving the page - switching apps, locking the phone, closing the tab -
   * must not leave the soundtrack playing. Pausing only turned it down, so a
   * backgrounded game kept singing.
   */
  _silence() {
    this.music?.stop(0.2);
    this.audio.flame(false);
    this.fx?.stopFlame();
    this.audio.suspend();
  }

  /** Coming back: the context needs waking, and the music was stopped, not ducked. */
  _wake() {
    if (!this.soundOn) return;
    this.audio.resume();
    if (this.musicStyle !== 'off' && this.state !== 'dead') this._startMusic();
  }

  _startMusic(preview = false) {
    this.audio.init();
    this.audio.resume();
    if (!this.audio.ctx) return;
    if (!this.music) this.music = new Music(this.audio.ctx, this.audio.musicBus);
    if (this.musicStyle === 'off') { this.music.stop(0.4); return; }
    this.music.setStyle(this.musicStyle);
    this.music.setIntensity(preview ? 0.75 : this.music.intensity);
    this.music.start();
  }

  _musicIntensity() {
    if (this.state !== 'playing') return 0.25;
    if (this.restTimer > 0) return 0.32;
    if (this.rhinos.some((r) => r.alive && r.cfg.boss)) return 1;
    return 0.6 + Math.min(this.wave, 12) / 12 * 0.18;
  }

  _goFullscreen() {
    if (!this.wantFullscreen || document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }

  toMenu() {
    this._saveRun();
    this.state = 'menu';
    this.leaveCoop();
    this.music?.stop(0.8);
    document.body.classList.remove('playing');
    document.exitPointerLock?.();
    $('menu').classList.remove('hidden');
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('revive').classList.add('hidden');
    $('hud').classList.add('hidden');
    this._paintResume();
    $('best-menu').textContent = this.best.toLocaleString('id-ID');
  }

  pause(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.rex.breathing = false;
      this.audio.flame(false);
      this.fx.stopFlame();
      this.music?.setVolume(0.28);
      this._saveRun();
      $('pause').classList.remove('hidden');
      document.exitPointerLock?.();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      $('pause').classList.add('hidden');
      this.music?.setVolume(0.85);
      this._goFullscreen();
      this.input.requestLock();
    }
  }

  gameOver() {
    this.state = 'dead';
    this.music?.stop(1.4);
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

    if (this.run) {
      const w = this.run.weapons;
      const topWeapon = Object.keys(w).reduce((a, b) => (w[b] > w[a] ? b : a), 'bite');
      this._lastRunSeconds = (performance.now() - this.run.t0) / 1000;
      Stats.recordRun({
        score: this.score,
        wave: Math.max(1, this.wave),
        kills: this.kills,
        bosses: this.run.bosses,
        seconds: (performance.now() - this.run.t0) / 1000,
        weapons: w,
        topWeapon: w[topWeapon] > 0 ? topWeapon : null,
      });
      const panel = document.getElementById('statspanel');
      if (panel && !panel.classList.contains('hidden')) Stats.renderPanel(panel);
      this.run = null;
    }

    $('revive').classList.add('hidden');
    this._clearRun();
    this._pendingScore = this.score > 0 && (Scores.qualifies(this.score) || Global.available());
    this._lastRank = 0;
    this._globalRank = 0;
    $('go-status').textContent = '';
    $('go-status').className = 'status';
    const entry = $('go-entry');
    if (this._pendingScore) {
      const provisional = [...Scores.list(), { score: this.score }]
        .sort((a, b) => b.score - a.score)
        .findIndex((e) => e.score === this.score) + 1;
      entry.querySelector('.rank').innerHTML = Global.available()
        ? 'Simpan skormu ke papan <b>global</b> dan ke perangkat ini'
        : `Skor tertinggi baru — peringkat <b id="go-rank">${provisional}</b> di perangkat ini!`;
      $('go-name').value = Scores.lastName();
      entry.classList.remove('hidden');
    } else {
      entry.classList.add('hidden');
    }
    this.renderScores($('go-table'), -1, 5);
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
    const dmg = WAVES.damageScale(this.wave);
    plan.forEach((key, i) => {
      const r = new Rhino(this.scene, key, pts[i]);
      r.yaw = Math.atan2(this.rex.pos.x - pts[i].x, this.rex.pos.z - pts[i].z);
      r.dmgScale = dmg;
      this.rhinos.push(r);
    });
    const best = Stats.stats().bestWave || 0;
    if (this.wave > best && this.wave > 1) {
      this.banner('REKOR BARU!', `Gelombang ${this.wave} — terjauh sejauh ini`);
    }
    const boss = plan.includes('matriarch');
    this.banner(`GELOMBANG ${this.wave}`, boss ? '⚠️ MATRIARK BADAK MUNCUL!' : `${plan.length} badak menyerbu`);
    this.audio.wave();
    this.mp?.announceWave(this.wave, plan.length, boss);
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
      if (this.mp && !this.mp.isHost) {
        this.mp.claimHit(r, cfg.damage, type, to);       // the host is the judge
        this._registerHit(r, cfg.damage, type, to);      // local feedback only
      } else {
        const dealt = r.takeDamage(cfg.damage, opts);
        this._registerHit(r, dealt, type, to);
      }
      if (this.run) this.run.weapons[type] += 1;
      hits++;
    }
    if (type === 'tail') {
      for (const o of this.world.obstacles) {
        if (!o.alive || o.hp === undefined) continue;
        const d = Math.hypot(o.pos.x - this.rex.pos.x, o.pos.z - this.rex.pos.z) - o.radius;
        if (d < cfg.range) this.world.damage(o, SCENERY.tailDamage, 'smash', this.fx);
      }
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

  /**
   * Where the fireball should land: the rhino you are roughly facing, or a
   * point on the ground ahead, pushed further out as you aim higher.
   */
  _ballTarget(fwd) {
    let best = null, bd = FIREBALL.range * FIREBALL.range;
    for (const r of this.livingRhinos()) {
      const to = r.pos.clone().sub(this.rex.pos).setY(0);
      const d2 = to.lengthSq();
      if (d2 > bd || d2 < 1) continue;
      if (to.normalize().dot(fwd) < 0.8) continue;      // only what is in front
      bd = d2; best = r;
    }
    if (best) {
      const lead = Math.sqrt(bd) / FIREBALL.speed;      // lead a charging target
      return best.pos.clone().addScaledVector(best.vel, lead * 0.8).setY(1.7 * best.scaleF);
    }
    const dist = clamp(30 - this.chase.pitch * 20, 14, 58);
    return this.rex.pos.clone().addScaledVector(fwd, dist).setY(1.6);
  }

  /** Throws or plants whatever you are carrying. */
  useItem() {
    if (!this.item || this.state !== 'playing' || !this.rex.alive) return false;
    const kind = this.item.kind;
    const cfg = ITEMS.kinds[kind];

    if (kind === 'dinamit') {
      const origin = this.rex.mouthPosition;
      const fwd = this.rex.forward;
      const target = this._ballTarget(fwd);
      const flat = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
      const t = Math.max(flat.length() / cfg.speed, 0.12);
      const vy = (target.y - origin.y - 0.5 * cfg.gravity * t * t) / t;
      const vel = new THREE.Vector3(flat.x / t, clamp(vy, -14, 26), flat.z / t);
      this.balls.push(new Fireball(this.scene, origin, vel, 'dinamit'));
      this.audio.bite();
    } else {
      const at = this.rex.pos.clone().addScaledVector(this.rex.forward, -2.5);
      this.mines.push(new Mine(this.scene, at));
      this.fx.dustBurst(at.clone().setY(0.3), 8, 0.8);
      this.audio.stomp();
    }

    this.item.charges -= 1;
    if (this.item.charges <= 0) this.item = null;
    Stats.event(`item-used-${kind}`, `Item dipakai: ${kind}`);
    return true;
  }

  _spawnBall() {
    const origin = this.rex.mouthPosition;
    const fwd = this.rex.forward;
    const target = this._ballTarget(fwd);

    // solve the arc: horizontal speed is fixed, vertical is whatever lands it
    const flat = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
    const t = Math.max(flat.length() / FIREBALL.speed, 0.12);
    const vy = (target.y - origin.y - 0.5 * FIREBALL.gravity * t * t) / t;
    const vel = new THREE.Vector3(flat.x / t, clamp(vy, -14, 22), flat.z / t);

    this.balls.push(new Fireball(this.scene, origin, vel));
    if (this.run) this.run.weapons.fireball += 1;
    this.fx.impact(origin, 0xffb23d, 18);
    this.fx.shake(0.3);
  }

  _updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      this.fx.trail(ball.pos, dt);
      const hit = ball.update(dt, this.rhinos, this.world);
      if (!hit) continue;
      if (!hit.fizzle) {
        const cfg = ball.kind === 'dinamit' ? ITEMS.kinds.dinamit : null;
        this._explode(hit.pos, hit.direct, cfg
          ? { splash: cfg.splash, damage: cfg.damage, knockback: cfg.knockback, stun: cfg.stun, burn: false }
          : {});
      }
      ball.dispose();
      this.balls.splice(i, 1);
    }
  }

  _updateMines(dt) {
    const cfg = ITEMS.kinds.ranjau;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.update(dt, this.rhinos)) {
        this._explode(m.pos.clone().setY(0.6), null, {
          splash: cfg.splash, damage: cfg.damage, knockback: cfg.knockback, stun: cfg.stun, burn: false,
        });
        m.dispose();
        this.mines.splice(i, 1);
      }
    }
  }

  _explode(pos, direct, opts = {}) {
    const splash = opts.splash || FIREBALL.splash;
    const power = opts.damage || FIREBALL.splashDamage;
    const knock = opts.knockback || FIREBALL.knockback;
    const stunBase = opts.stun || 0.6;
    this.fx.blast(pos);
    this.mp?.broadcastFx('blast', pos);
    for (const o of this.world.obstacles) {
      if (!o.alive || o.hp === undefined) continue;
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) - o.radius;
      if (d > splash) continue;
      const falloff = 1 - Math.max(0, d) / splash;
      this.world.damage(o, SCENERY.blastDamage * falloff, 'fire', this.fx);
    }
    this.fx.shake(1.1);
    this.audio.stomp();
    this.audio.crunch();
    for (const r of this.livingRhinos()) {
      const d = r.pos.distanceTo(pos) - r.radius;
      if (d > splash) continue;
      const falloff = 1 - Math.max(0, d) / splash;
      let dmg = power * falloff;
      if (r === direct) dmg += FIREBALL.damage;
      const away = r.pos.clone().sub(pos).setY(0).normalize();
      const dealt = r.takeDamage(dmg, {
        knock: away, knockStrength: knock * falloff,
        burn: opts.burn === false ? undefined : FIREBALL.burn,
        stun: stunBase * (0.6 + falloff),
      });
      this.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(dealt), 'burn');
      this.fx.thwack(r.pos.clone().setY(2.0 * r.scaleF), away, IMPACT.sparksPerHit, 1.2);
      if (!r.alive) this._onKill(r, 'fireball');
    }
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

    for (const o of this.world.obstacles) {
      if (!o.alive || o.hp === undefined) continue;
      const to = new THREE.Vector3(o.pos.x - flat.x, 0, o.pos.z - flat.z);
      const d = to.length() - o.radius;
      if (d > cfg.range) continue;
      to.normalize();
      if (d > 0.5 && fwd.dot(to) < cosHalf) continue;
      this.world.damage(o, SCENERY.fireDps * dt, 'fire', Math.random() < dt * 4 ? this.fx : null);
    }
    for (const r of this.livingRhinos()) {
      const to = r.pos.clone().setY(0).sub(flat);
      const d = to.length() - r.radius;
      if (d > cfg.range) continue;
      to.normalize();
      if (d > 0.5 && fwd.dot(to) < cosHalf) continue;
      const dealt = r.takeDamage(cfg.dps * dt, { burn: { time: cfg.burnTime, dps: cfg.burnDps } });
      this._fireAccum = (this._fireAccum || 0) + dealt;
      if (this.run) this.run.weapons.fire += dealt / 40;   // scaled so it compares with melee hits
      r._fireTally = (r._fireTally || 0) + dealt;
      if (r._fireTally > 22) { this.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(r._fireTally), 'burn'); r._fireTally = 0; }
      if (!r.alive) this._onKill(r, 'fire');
    }
  }

  _registerHit(r, dealt, type, dir = null) {
    const cls = type === 'bite' ? 'bite' : type === 'tail' ? 'tail' : '';
    this.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(dealt), cls);
    this.fx.impact(r.pos.clone().setY(2.4 * r.scaleF), type === 'bite' ? 0xff88a0 : 0xffe08a, type === 'bite' ? 16 : 10);
    this.fx.thwack(r.pos.clone().setY(2.2 * r.scaleF), dir, type === 'bite' ? IMPACT.sparksPerHit + 3 : IMPACT.sparksPerHit, type === 'bite' ? 1.15 : 0.9);
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
    this.fx.thwack(r.pos.clone().setY(2.2 * r.scaleF), null, Math.round(IMPACT.sparksPerKill * r.scaleF), 1.3);
    this.fx.dustBurst(r.pos.clone().setY(0.4), 12, r.scaleF);
    this.fx.number(r.pos.clone().setY(5.2 * r.scaleF), `+${Math.round(r.cfg.score * mult)}`, 'score');
    this.fx.shake(r.cfg.boss ? 1.4 : 0.35);
    this.audio.snort();
    if (r.cfg.boss && this.run) this.run.bosses += 1;
    if (r.cfg.boss || Math.random() < WAVES.dropChance(this.wave)) this._dropPickup(r.pos.clone());
    if (r.cfg.boss || Math.random() < ITEMS.dropChance) {
      const at = r.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
      this._dropItemCrate(at, this._rollItem());
    }
    if (this.rex.combo > 0 && this.rex.combo % 5 === 0) this.banner(`COMBO ×${this.rex.combo}`, 'Badak berjatuhan!');
  }

  /**
   * Weighted pick, with the previous item's weight knocked down. Kart racers
   * do something similar so you are not handed the same thing every time.
   */
  _rollItem() {
    const entries = Object.entries(ITEMS.kinds);
    let total = 0;
    const weights = entries.map(([kind, cfg]) => {
      const w = cfg.weight * (kind === this.lastItem ? ITEMS.repeatWeight : 1);
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) return entries[i][0];
    }
    return entries[0][0];
  }

  _dropItemCrate(pos, kind) {
    const cfg = ITEMS.kinds[kind];
    const g = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.3, 1.3),
      new THREE.MeshLambertMaterial({ color: 0xffd45e, emissive: 0x5a3c00, emissiveIntensity: 0.35 })
    );
    g.add(crate);
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 0.18, 1.36),
        new THREE.MeshLambertMaterial({ color: 0xc2410c })
      );
      band.position.y = sx * 0.34;
      g.add(band);
    }
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.6, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.1;
    g.add(halo);
    g.position.copy(pos).setY(1.4);
    this.scene.add(g);
    this.pickups.push({ mesh: g, t: 0, life: 26, kind, item: kind, label: cfg.label });
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
    this.world.update(dt, this.fx);
    this.world.followSun(this.rex.pos);
    this._musicTimer = (this._musicTimer || 0) - dt;
    if (this.music?.playing && this._musicTimer <= 0) {
      this._musicTimer = 1.0;
      this.music.setIntensity(this._musicIntensity());
    }
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
      for (const r of this.rhinos) if (!r.dead) r.faceBar(this.camera.quaternion, this.camera.position, this.rex.pos, this._pxFactor);
      return;
    }

    // ---- fire breath ----
    const wantsFire = input.fire && this.rex.canBreathe();
    if (wantsFire && !this.rex.breathing) { this.rex.breathing = true; this.audio.flame(true); }
    if ((!input.fire || !this.rex.alive || this.rex.fire <= 0) && this.rex.breathing) {
      this.rex.breathing = false; this.audio.flame(false); this.fx.stopFlame();
    }
    if (!this.rex.breathing) this.fx.stopFlame();

    // ---- attack input, with a short buffer ----
    // Pressing an attack mid-animation used to be thrown away; hold it for a
    // moment instead so the next swing comes out the instant it can.
    if (input.consume('useItem')) this.useItem();
    for (const k of ATTACK_KEYS) if (input.consume(k)) this._buffered[k] = INPUT_BUFFER;
    for (const k of ATTACK_KEYS) {
      if (this._buffered[k] <= 0) continue;
      this._buffered[k] -= dt;
      if (k === 'bite') {
        if (this.rex.startAttack('bite')) { this._buffered.bite = 0; this.audio.bite(); this.mp?.sendAttack('bite'); }
      } else if (k === 'tail') {
        const aim = this._aimYaw(ATTACK.tail.aimRange);
        if (this.rex.startAttack('tail', aim)) { this._buffered.tail = 0; this.audio.tail(); this.mp?.sendAttack('tail', aim); }
      } else if (this.rex.canFireball() && this.rex.startAttack('fireball')) {
        this._buffered.fireball = 0;
        this.rex.fire -= FIREBALL.cost;
        this.rex.cooldown.fireball = FIREBALL.cooldown;
        this.audio.roar();
      }
    }
    this._spinDust(dt);
    this._updateBalls(dt);
    this._updateMines(dt);

    const hitEvent = this.rex.update(dt, input, this.chase.yaw, this.world);
    if (hitEvent === 'fireball') this._spawnBall();
    else if (hitEvent) this.coneHit(hitEvent);
    if (this.rex.breathing) this.fireTick(dt);

    // ---- enemies ----
    const hpBefore = this.rex.hp;
    if (this.mp && !this.mp.isHost) {
      for (const r of this.rhinos) r.updateRemote(dt);     // the host simulates them
    } else if (this.mp) {
      const targets = this.mp.targets();
      for (const r of this.rhinos) r.update(dt, this._nearest(targets, r.pos), this.world, this.rhinos, this.fx);
    } else {
      for (const r of this.rhinos) r.update(dt, this.rex, this.world, this.rhinos, this.fx);
    }
    for (const r of this.rhinos) { if (!r.alive && !r._counted && !r.dead) this._onKill(r, 'dot'); if (!r.dead) r.faceBar(this.camera.quaternion, this.camera.position, this.rex.pos, this._pxFactor); }
    for (let i = this.rhinos.length - 1; i >= 0; i--) if (this.rhinos[i].dead) this.rhinos.splice(i, 1);
    if (this.rex.hp < hpBefore) { this.audio.hurt(); this._flashVignette(); }

    // ---- co-op: session traffic, respawns instead of a hard game over ----
    if (this.mp) {
      this.mp.update(dt);
      if (!this.rex.alive) {
        if (this._respawn <= 0) {
          this._respawn = 6;
          this.banner('TUMBANG!', 'Bangkit lagi dalam 6 detik…');
        } else {
          this._respawn -= dt;
          if (this._respawn <= 0) this._revive();
        }
      }
      if (this.mp.isHost && !this.rex.alive && [...this.mp.players.values()].every((p) => p.downed)) {
        this.mp.net.send({ t: 'over' }, 'evt');
        this.gameOver();
        return;
      }
    }

    // ---- wave flow (host only: snapshots carry the host's rest timer, and a
    // guest running this would spawn a second, local set of rhinos) ----
    if (this.mp && !this.mp.isHost) {
      this.chase.update(dt, this.rex, this.world, this.fx.shakeAmount, this.zoom, input.move);
      this._updateHud();
      return;
    }
    if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.nextWave();
    } else if (this.livingRhinos().length === 0 && this.rhinos.every((r) => !r.alive)) {
      this.restTimer = WAVES.restBetween;
      this.rex.heal(WAVES.restHeal);
      this._saveRun();                       // a cleared wave is the safest point to keep
      this.banner(`GELOMBANG ${this.wave} AMAN!`, 'Pulih sebentar…');
      this.score += 120 * this.wave;
    }

    this.chase.update(dt, this.rex, this.world, this.fx.shakeAmount, this.zoom, input.move);

    this._saveTimer -= dt;
    if (this._saveTimer <= 0) { this._saveTimer = PROGRESS.autosaveEvery; this._saveRun(); }

    if (!this.rex.alive && !this.mp) {
      // only worth interrupting for if there is a run to save; dying on wave 1
      // just wants a fast restart
      if (this._revives > 0 && this.wave >= 2) this._offerRevive();
      else this.gameOver();
    }
    this._updateHud();
  }

  _nearest(list, pos) {
    let best = list[0], bd = Infinity;
    for (const p of list) {
      const d = (p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.life -= dt;
      p.mesh.rotation.y += dt * 1.6;
      p.mesh.position.y = 1.3 + Math.sin(p.t * 3) * 0.22;
      if (p.item) p.mesh.rotation.x += dt * 0.9;
      const d = p.mesh.position.distanceTo(this.rex.pos);
      if (d < 4.2 && this.state === 'playing' && this.rex.alive) {
        if (p.item) {
          const cfg = ITEMS.kinds[p.item];
          this.item = { kind: p.item, charges: cfg.charges };
          this.lastItem = p.item;
          this.fx.impact(p.mesh.position.clone(), 0xffe08a, 22);
          this.fx.number(p.mesh.position.clone(), `${cfg.glyph} ${cfg.label}`, 'score');
          this.banner(`${cfg.glyph} ${cfg.label.toUpperCase()}`, `${cfg.charges}× — tekan Q`);
          Stats.once(`item-${p.item}`, `Item diambil: ${p.item}`);
        } else {
          this.rex.heal(26);
          this.rex.fire = Math.min(REX.maxFire, this.rex.fire + 30);
          this.fx.impact(p.mesh.position.clone(), 0x9dff8a, 20);
          this.fx.number(p.mesh.position.clone(), '+26 HP', 'heal');
        }
        this.audio.pickup();
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      } else if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  _offerRevive() {
    this.state = 'dead';
    this.audio.flame(false);
    this.fx.stopFlame();
    this.music?.setVolume(0.2);
    $('rv-wave').textContent = String(Math.max(1, this.wave));
    $('rv-score').textContent = this.score.toLocaleString('id-ID');
    $('revive').classList.remove('hidden');
    document.exitPointerLock?.();
    Stats.event('revive-offered', 'Ditawari bangkit lagi');
  }

  takeRevive() {
    this._revives -= 1;
    $('revive').classList.add('hidden');
    this.state = 'playing';
    this.music?.setVolume(0.85);
    this._revive();
    this.rex.hp = PROGRESS.reviveHp;
    this.rex.invuln = PROGRESS.reviveGrace;
    // shove the herd off before standing back up, or you die again instantly
    for (const r of this.livingRhinos()) {
      const away = r.pos.clone().sub(this.rex.pos).setY(0);
      if (away.length() > PROGRESS.reviveClearRadius) continue;
      away.normalize();
      r.takeDamage(0, { knock: away, knockStrength: 30, stun: 1.4 });
    }
    this.fx.ring(this.rex.pos.clone().setY(0.8), 0xffd98a);
    this.fx.shake(0.9);
    this.audio.roar();
    this.banner('BANGKIT LAGI!', 'Kesempatan terakhir');
    this.input.requestLock();
    this._saveRun();
    Stats.event('revive-taken', 'Bangkit lagi dipakai');
  }

  _revive() {
    const rex = this.rex;
    rex.alive = true;
    rex.hp = 60;
    rex.fire = REX.maxFire;
    rex.vel.set(0, 0, 0);
    rex.invuln = 2.5;
    rex.resetPose();
    const a = Math.random() * Math.PI * 2;
    rex.pos.set(Math.cos(a) * 26, 0, Math.sin(a) * 26);
    this.banner('BANGKIT!', 'Kembali berburu');
  }

  /**
   * Arrows at the screen edge pointing at rhinos you cannot see. Only shown
   * when the wave is nearly cleared: that is when hunting the last stragglers
   * across a 150-unit arena stops being fun, and showing sixteen at once would
   * just be noise.
   */
  _updateOffscreen() {
    const host = $('offscreen');
    const alive = this.livingRhinos();
    const show = alive.length > 0 && alive.length <= 3 && this.state === 'playing';
    if (!show) {
      if (host.childElementCount) host.replaceChildren();
      return;
    }
    while (host.childElementCount < alive.length) {
      const el = document.createElement('div');
      el.className = 'arrow';
      host.appendChild(el);
    }
    while (host.childElementCount > alive.length) host.lastElementChild.remove();

    const w = innerWidth, h = innerHeight, margin = 42;
    const v = new THREE.Vector3();
    alive.forEach((r, i) => {
      const el = host.children[i];
      v.set(r.pos.x, 2, r.pos.z).project(this.camera);
      const behind = v.z > 1;
      if (behind) { v.x = -v.x; v.y = -v.y; }
      const onScreen = !behind && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98;
      if (onScreen) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.classList.toggle('boss', !!r.cfg.boss);
      // Ride an ellipse around the centre rather than the window frame. The
      // frame puts arrows in the corners, which is exactly where the joystick,
      // the attack pads and the HUD panels live.
      const angle = Math.atan2(-v.y, v.x);
      const x = w / 2 + Math.cos(angle) * w * 0.34;
      const y = h / 2 + Math.sin(angle) * h * 0.34;
      const deg = angle * 180 / Math.PI + 90;
      el.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg)`;
      void margin;
    });
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
    $('txt-wave').textContent = String(Math.max(1, this.mp && !this.mp.isHost ? this.mp.remoteWave : this.wave));
    const shownScore = this.mp && !this.mp.isHost ? this.mp.remoteScore : this.score;
    $('txt-score').textContent = shownScore.toLocaleString('id-ID');
    $('txt-players').textContent = this.mp ? `👥 ${this.mp.playerCount}` : '';
    const left = this.livingRhinos().length;
    $('txt-left').textContent = this.restTimer > 0 ? `istirahat ${Math.ceil(this.restTimer)}s` : `${left} badak`;
    // a matriarch gets a proper boss bar; her world-space one is easy to lose
    // in a crowd
    const boss = this.rhinos.find((r) => r.alive && r.cfg.boss);
    const bossBar = $('bossbar');
    if (boss) {
      const f = clamp(boss.hp / boss.maxHp, 0, 1);
      bossBar.classList.remove('hidden');
      $('boss-fill').style.transform = `scaleX(${f})`;
      this._bossGhost = f > (this._bossGhost ?? f) ? f : Math.max(f, (this._bossGhost ?? f) - 0.004);
      $('boss-ghost').style.transform = `scaleX(${this._bossGhost})`;
    } else {
      bossBar.classList.add('hidden');
      this._bossGhost = undefined;
    }

    this._updateOffscreen();

    const combo = $('combo');
    if (this.rex.combo >= 2) {
      combo.classList.add('show');
      combo.textContent = `COMBO ×${this.rex.combo}`;
    } else combo.classList.remove('show');

    const bite = String(1 - this.rex.cooldown.bite / ATTACK.bite.cooldown);
    const tail = String(1 - this.rex.cooldown.tail / ATTACK.tail.cooldown);
    const ball = String(Math.min(1 - this.rex.cooldown.fireball / FIREBALL.cooldown, this.rex.fire / FIREBALL.cost));
    for (const [id, v] of [['cd-bite', bite], ['cd-tail', tail], ['cd-fire', String(fire)], ['cd-ball', ball],
                           ['tb-bite', bite], ['tb-tail', tail], ['tb-fire', String(fire)], ['tb-ball', ball]]) {
      $(id)?.style.setProperty('--cd', v);
    }
    $('cd-fire').classList.toggle('empty', this.rex.fire <= REX.fireMinToStart);

    // the cannon waits six seconds, which is long enough to want a number and
    // a clear "it is back" signal rather than just a shrinking overlay
    const cannonLeft = this.rex.cooldown.fireball;
    const cooling = cannonLeft > 0.05;
    const secs = cooling ? String(Math.ceil(cannonLeft)) : '';
    for (const id of ['cd-ball', 'tb-ball']) {
      const el = $(id);
      el.classList.toggle('cooling', cooling);
      $(`${id}-num`).textContent = secs;
    }
    if (this._ballWasCooling && !cooling) {
      for (const id of ['cd-ball', 'tb-ball']) {
        const el = $(id);
        el.classList.remove('ready');
        void el.offsetWidth;
        el.classList.add('ready');
        setTimeout(() => el.classList.remove('ready'), 600);
      }
      this.audio.pickup();
    }
    this._ballWasCooling = cooling;

    const card = $('cd-item'), pad = $('tb-item');
    if (this.item) {
      const cfg = ITEMS.kinds[this.item.kind];
      card.classList.remove('hidden');
      pad.classList.remove('hidden');
      $('item-glyph').textContent = cfg.glyph;
      $('item-name').textContent = cfg.label;
      $('item-count').textContent = String(this.item.charges);
      $('tb-item-count').textContent = String(this.item.charges);
      pad.firstChild.textContent = cfg.glyph;
    } else {
      card.classList.add('hidden');
      pad.classList.add('hidden');
    }
    $('cd-ball').classList.toggle('empty', !this.rex.canFireball());
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
