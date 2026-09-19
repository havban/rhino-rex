/**
 * Co-op session: glues the game to the peer-to-peer link.
 *
 * Split of responsibility (a "trusted friends" model, which is the right
 * trade for co-op and avoids a full authoritative-netcode rewrite):
 *
 *   every player  owns its own dinosaur's position and health
 *   the host      owns the rhinos, the waves, the pickups and the score
 *
 * Guests claim damage on rhinos ("I bit #7 for 26") and the host applies it.
 * A guest could lie; a guest could also just edit its own game. Co-op with
 * people you invited by room code does not need more than this.
 */
import * as THREE from 'three';
import { Rex } from './rex.js';
import { Rhino } from './rhino.js';

const SNAPSHOT_HZ = 15;
const INPUT_HZ = 20;
const r1 = (n) => Math.round(n * 10) / 10;

export class Session {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.players = new Map();     // peerId -> { name, rex, downed, score }
    this.rhinoIds = new Map();    // networked id -> Rhino
    this.nextRhinoId = 1;
    this._snapT = 0;
    this._inputT = 0;
    this.remoteScore = 0;
    this.remoteWave = 1;
    this.banner = null;

    net.onMessage = (msg, peer) => this._onMessage(msg, peer);
    net.onPeerJoin = (peer) => this._onJoin(peer);
    net.onPeerLeave = (peer) => this._onLeave(peer);
  }

  get isHost() { return this.net.isHost; }
  get playerCount() { return this.players.size + 1; }

  // --------------------------------------------------------------- roster --
  _avatar(id, name) {
    let p = this.players.get(id);
    if (p) return p;
    const rex = new Rex(this.game.scene);
    rex.remote = true;
    rex.pos.set(0, 0, 0);
    rex.root.visible = true;
    // tint the twin so you can tell each other apart
    const hue = (this.players.size * 0.27 + 0.42) % 1;
    const tint = new THREE.Color().setHSL(hue, 0.7, 0.55);
    rex.mats.skin.color.copy(tint);
    rex.mats.stripe.color.copy(tint.clone().multiplyScalar(0.7));
    p = { id, name: name || 'Pemain', rex, downed: false };
    this.players.set(id, p);
    return p;
  }

  _onJoin(peer) {
    // guests wait for the first pose: the host's real id arrives with it, and
    // keying an avatar off the connection instead would duplicate the player
    if (this.isHost) this._avatar(peer.id, peer.name);
    this.game.banner('PEMAIN BERGABUNG', peer.name || 'Pemain');
    if (this.isHost) {
      this.net.send({ t: 'welcome', wave: this.game.wave, score: this.game.score }, 'evt');
    }
  }

  _onLeave(peer) {
    const p = this.players.get(peer.id);
    if (!p) return;
    p.rex.scene.remove(p.rex.root);
    this.players.delete(peer.id);
    this.game.banner('PEMAIN KELUAR', p.name);
  }

  // -------------------------------------------------------------- inbound --
  _onMessage(msg, peer) {
    switch (msg.t) {
      case 'p': {                                   // a player's own pose
        const id = msg.i || peer.id;
        if (id === this.net.self.id) break;
        const p = this._avatar(id, msg.n);
        p.rex.net.x = msg.x; p.rex.net.z = msg.z; p.rex.net.yaw = msg.y;
        p.rex.hp = msg.hp;
        p.rex.alive = !msg.d;
        p.downed = !!msg.d;
        if (this.isHost) this.net.send(msg, 'state', peer);   // relay to the others
        break;
      }
      case 'atk': {                                 // play the swing on the twin
        const from = msg.i || peer.id;
        const p = this.players.get(from);
        if (p && !p.rex.attack) p.rex.startAttack(msg.k, msg.a ?? null);
        if (this.isHost) this.net.send({ ...msg, i: from }, 'evt', peer);
        break;
      }
      case 'hit': {                                 // guest claims damage on a rhino
        if (!this.isHost) break;
        const r = this.rhinoIds.get(msg.r);
        void peer;
        if (r && r.alive) {
          const dealt = r.takeDamage(msg.d, { knock: new THREE.Vector3(msg.kx || 0, 0, msg.kz || 0), knockStrength: msg.ks || 8 });
          this.game.fx.thwack(r.pos.clone().setY(2.2 * r.scaleF), null, 6, 1);
          if (!r.alive) this.game._onKill(r, msg.k || 'bite');
          else this.game.fx.number(r.pos.clone().setY(4.4 * r.scaleF), Math.round(dealt), '');
        }
        break;
      }
      case 's': this._applySnapshot(msg); break;    // host -> guests
      case 'ph': {                                  // host tells us we were hit
        if (this.isHost) break;
        this.game.rex.damage(msg.d, null);
        break;
      }
      case 'fx': {
        const v = new THREE.Vector3(msg.x, msg.y, msg.z);
        if (msg.k === 'blast') this.game.fx.blast(v);
        else if (msg.k === 'thwack') this.game.fx.thwack(v, null, 8, 1);
        else this.game.fx.impact(v, 0xffc247, 16);
        break;
      }
      case 'wave': {
        this.remoteWave = msg.n;
        this.game.banner(`GELOMBANG ${msg.n}`, msg.b ? '⚠️ MATRIARK BADAK MUNCUL!' : `${msg.c} badak menyerbu`);
        break;
      }
      case 'welcome': {
        this.remoteWave = msg.wave;
        this.remoteScore = msg.score;
        break;
      }
      case 'over': if (!this.isHost) this.game.gameOver(); break;
      default: break;
    }
  }

  _applySnapshot(msg) {
    if (this.isHost) return;
    this.remoteScore = msg.sc;
    this.remoteWave = msg.w;
    this.game.restTimer = msg.rt;

    const seen = new Set();
    for (const row of msg.r) {
      const [id, x, z, yaw, hp, variant, scale] = row;
      seen.add(id);
      let r = this.rhinoIds.get(id);
      if (!r) {
        r = new Rhino(this.game.scene, variant, new THREE.Vector3(x, 0, z));
        r.remote = true;
        r.netId = id;                    // needed so our hits can name a target
        this.rhinoIds.set(id, r);
        this.game.rhinos.push(r);
      }
      r.net.x = x; r.net.z = z; r.net.yaw = yaw;
      if (hp <= 0 && r.alive) { r.alive = false; r.dying = 0.0001; }
      else r.hp = hp;
      void scale;
    }
    for (const [id, r] of this.rhinoIds) {
      if (seen.has(id) || !r.alive) continue;
      r.alive = false;                    // the host dropped it: fade it out
      r.dying = 0.0001;
    }
    for (const row of msg.p || []) {
      const [id, x, z, yaw, hp, down] = row;
      if (id === this.net.self.id) continue;
      const p = this._avatar(id, null);
      p.rex.net.x = x; p.rex.net.z = z; p.rex.net.yaw = yaw;
      p.rex.hp = hp;
      p.downed = !!down;
    }
  }

  // ------------------------------------------------------------- outbound --
  update(dt) {
    const game = this.game;
    for (const p of this.players.values()) p.rex.updateRemote(dt);

    this._inputT -= dt;
    if (this._inputT <= 0) {
      this._inputT = 1 / INPUT_HZ;
      this.net.send({
        t: 'p', i: this.net.self.id, n: this.net.self.name,
        x: r1(game.rex.pos.x), z: r1(game.rex.pos.z), y: r1(game.rex.yaw),
        hp: Math.round(game.rex.hp), d: game.rex.alive ? 0 : 1,
      }, 'state');
    }

    if (!this.isHost) return;

    // the host owns the world, so it ships the world
    this._snapT -= dt;
    if (this._snapT <= 0) {
      this._snapT = 1 / SNAPSHOT_HZ;
      const rhinos = [];
      for (const r of game.rhinos) {
        if (r.dead) continue;
        if (r.netId === undefined) { r.netId = this.nextRhinoId++; this.rhinoIds.set(r.netId, r); }
        rhinos.push([r.netId, r1(r.pos.x), r1(r.pos.z), r1(r.yaw), Math.round(r.hp), r.variant, r.scaleF]);
      }
      const players = [[this.net.self.id, r1(game.rex.pos.x), r1(game.rex.pos.z), r1(game.rex.yaw), Math.round(game.rex.hp), game.rex.alive ? 0 : 1]];
      for (const [id, p] of this.players) {
        players.push([id, r1(p.rex.pos.x), r1(p.rex.pos.z), r1(p.rex.yaw), Math.round(p.rex.hp), p.downed ? 1 : 0]);
      }
      this.net.send({ t: 's', r: rhinos, p: players, w: game.wave, rt: r1(game.restTimer), sc: game.score }, 'state');
    }

    // forward the damage rhinos dealt to other players' dinosaurs
    for (const [id, p] of this.players) {
      if (p.rex.takenDamage > 0) {
        this.net.send({ t: 'ph', d: Math.round(p.rex.takenDamage) }, 'evt');
        p.rex.takenDamage = 0;
        void id;
      }
    }
  }

  /** Called when the local player swings, so the twins animate too. */
  sendAttack(kind, aimYaw) {
    this.net.send({ t: 'atk', i: this.net.self.id, k: kind, a: aimYaw }, 'evt');
  }

  /** Guests do not apply rhino damage locally; they ask the host to. */
  claimHit(rhino, damage, kind, knock) {
    if (this.isHost || rhino.netId === undefined) return;
    this.net.send({
      t: 'hit', r: rhino.netId, d: Math.round(damage), k: kind,
      kx: knock ? r1(knock.x) : 0, kz: knock ? r1(knock.z) : 0,
    }, 'evt');
  }

  announceWave(n, count, boss) {
    if (this.isHost) this.net.send({ t: 'wave', n, c: count, b: boss }, 'evt');
  }

  broadcastFx(kind, pos) {
    this.net.send({ t: 'fx', k: kind, x: r1(pos.x), y: r1(pos.y), z: r1(pos.z) }, 'evt');
  }

  /** Targets rhinos should chase: the host's own rex plus every live twin. */
  targets() {
    const list = [this.game.rex];
    for (const p of this.players.values()) if (!p.downed && p.rex.alive) list.push(p.rex);
    return list;
  }

  destroy() {
    for (const p of this.players.values()) p.rex.scene.remove(p.rex.root);
    this.players.clear();
    this.rhinoIds.clear();
    this.net.close();
  }
}
