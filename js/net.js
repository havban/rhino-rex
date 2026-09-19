/**
 * Peer-to-peer plumbing for co-op.
 *
 * The Worker only brokers the handshake (HTTP polling, no WebSockets), after
 * which every packet goes browser-to-browser over WebRTC data channels:
 *
 *   state  unreliable + unordered - 15 Hz snapshots, stale ones are worthless
 *   evt    reliable + ordered     - joins, hits, deaths, wave changes
 *
 * The host keeps one connection per guest and relays between them; guests only
 * ever talk to the host. Without a TURN server a small share of strict NATs
 * will fail to connect - the UI reports that rather than hanging.
 */

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const POLL = 700;
const CONNECT_TIMEOUT = 30000;
const GATHER_TIMEOUT = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(base, path, body) {
  const res = await fetch(base.replace(/\/$/, '') + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error((out && out.error) || `HTTP ${res.status}`);
  return out;
}

/** Non-trickle ICE: one SDP blob once gathering settles, so polling suffices. */
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, GATHER_TIMEOUT);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class Net {
  constructor(base) {
    this.base = base;
    this.isHost = false;
    this.code = null;
    this.self = { id: 'me', name: 'Pemburu' };
    this.peers = new Map();        // id -> { id, name, pc, state, evt, ready, lastSeen }
    this.onMessage = () => {};
    this.onPeerJoin = () => {};
    this.onPeerLeave = () => {};
    this.onStatus = () => {};
    this._polls = [];
    this._closed = false;
  }

  get connectedCount() {
    let n = 0;
    for (const p of this.peers.values()) if (p.ready) n++;
    return n;
  }

  _status(text, kind = 'info') { this.onStatus(text, kind); }

  _wire(peer, channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      peer.ready = peer.ready || channel.label === 'evt';
      if (channel.label === 'evt') {
        this._status(`${peer.name || 'Pemain'} tersambung`, 'good');
        this.onPeerJoin(peer);
      }
    };
    channel.onclose = () => {
      if (channel.label === 'evt' && peer.ready) {
        peer.ready = false;
        this.onPeerLeave(peer);
      }
    };
    channel.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      peer.lastSeen = performance.now();
      this.onMessage(msg, peer);
    };
    peer[channel.label] = channel;
  }

  _newPeer(id, name) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = { id, name: name || 'Pemain', pc, ready: false, lastSeen: performance.now() };
    this.peers.set(id, peer);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && peer.ready) {
        peer.ready = false;
        this.onPeerLeave(peer);
      }
    };
    return peer;
  }

  // ------------------------------------------------------------- hosting --
  async host(name) {
    this.isHost = true;
    this.self.name = name || 'Tuan rumah';
    const out = await api(this.base, '/mp/room', { name: this.self.name });
    this.code = out.code;
    this.self.id = out.host;
    this._status(`Room ${this.code} siap — bagikan kodenya`);
    this._pollPeers();
    return this.code;
  }

  async _pollPeers() {
    const seen = new Set();
    while (!this._closed && this.isHost) {
      try {
        const { peers } = await api(this.base, `/mp/peers/${this.code}`);
        for (const row of peers) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            this._offerTo(row.id, row.name).catch((e) => this._status(`Gagal menyambung: ${e.message}`, 'bad'));
          }
          const peer = this.peers.get(row.id);
          if (peer && row.answer && !peer._answered) {
            peer._answered = true;
            await peer.pc.setRemoteDescription({ type: 'answer', sdp: row.answer });
          }
        }
      } catch { /* keep polling; the lobby shows the state */ }
      await sleep(POLL);
    }
  }

  async _offerTo(id, name) {
    const peer = this._newPeer(id, name);
    this._wire(peer, peer.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
    this._wire(peer, peer.pc.createDataChannel('evt', { ordered: true }));
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await gathered(peer.pc);
    await api(this.base, `/mp/sdp/${id}`, { kind: 'offer', sdp: peer.pc.localDescription.sdp });
    this._status(`Menyambungkan ${peer.name}…`);
  }

  // ------------------------------------------------------------- joining --
  async join(code, name) {
    this.isHost = false;
    this.self.name = name || 'Tamu';
    this.code = String(code || '').trim().toUpperCase();
    const { peer: id } = await api(this.base, `/mp/join/${this.code}`, { name: this.self.name });
    this.self.id = id;
    this._status(`Menunggu tuan rumah…`);

    const host = this._newPeer('host', 'Tuan rumah');
    host.pc.ondatachannel = (e) => this._wire(host, e.channel);

    const deadline = performance.now() + CONNECT_TIMEOUT;
    while (!this._closed) {
      if (performance.now() > deadline) throw new Error('tuan rumah tidak merespons');
      const row = await api(this.base, `/mp/sdp/${id}`);
      if (row.closed) throw new Error('room sudah ditutup');
      if (row.offer) {
        await host.pc.setRemoteDescription({ type: 'offer', sdp: row.offer });
        const answer = await host.pc.createAnswer();
        await host.pc.setLocalDescription(answer);
        await gathered(host.pc);
        await api(this.base, `/mp/sdp/${id}`, { kind: 'answer', sdp: host.pc.localDescription.sdp });
        this._status('Menyambungkan…');
        return true;
      }
      await sleep(POLL);
    }
    return false;
  }

  // -------------------------------------------------------------- traffic --
  /** `channel` picks reliability: 'state' for snapshots, 'evt' for events. */
  send(msg, channel = 'evt', exclude = null) {
    const data = JSON.stringify(msg);
    for (const peer of this.peers.values()) {
      if (!peer.ready || peer === exclude) continue;
      const ch = peer[channel];
      if (ch && ch.readyState === 'open') {
        try { ch.send(data); } catch { /* a full buffer is not fatal for snapshots */ }
      }
    }
  }

  close() {
    this._closed = true;
    for (const peer of this.peers.values()) {
      try { peer.pc.close(); } catch { /* already gone */ }
    }
    this.peers.clear();
    if (this.isHost && this.code) {
      api(this.base, `/mp/close/${this.code}`, {}).catch(() => {});
    }
    this.isHost = false;
    this.code = null;
  }
}
