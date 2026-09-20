// Tiny procedural sound kit — no asset downloads, everything is synthesised.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this._flame = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // music rides its own bus so the picker can mute it without killing SFX
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
    this.noiseBuf = this._noise(2);
  }

  resume() { this.ctx?.resume?.(); }
  // Backgrounding the tab has to stop the graph, not just turn it down: a
  // suspended context freezes currentTime, so nothing rings on in the
  // background and nothing is scheduled behind our backs.
  suspend() { this.ctx?.suspend?.().catch?.(() => {}); }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.5 : 0; }

  _noise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(node, t0, a, d, peak = 1) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  _burst({ freq = 200, type = 'sine', dur = 0.3, gain = 0.4, sweep = 0.3, filter = null }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(freq * sweep, 20), t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, 0.01, dur, gain);
    let last = o;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 800;
      o.connect(f); last = f;
    }
    last.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseBurst({ dur = 0.3, gain = 0.3, freq = 1200, q = 1, type = 'bandpass', sweepTo = null }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, 0.015, dur, gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  bite() { this._noiseBurst({ dur: 0.16, gain: 0.35, freq: 2400, q: 0.8, sweepTo: 300 }); this._burst({ freq: 150, type: 'square', dur: 0.12, gain: 0.18, sweep: 0.4 }); }
  tail() { this._noiseBurst({ dur: 0.34, gain: 0.3, freq: 500, q: 0.6, sweepTo: 2600 }); }
  hit() { this._burst({ freq: 110, type: 'triangle', dur: 0.18, gain: 0.3, sweep: 0.3 }); }
  crunch() { this._noiseBurst({ dur: 0.22, gain: 0.32, freq: 900, q: 2, sweepTo: 180 }); }
  hurt() { this._burst({ freq: 320, type: 'sawtooth', dur: 0.32, gain: 0.3, sweep: 0.25, filter: { type: 'lowpass', freq: 1200 } }); }
  snort() { this._noiseBurst({ dur: 0.28, gain: 0.22, freq: 380, q: 1.6, sweepTo: 140 }); }
  stomp() { this._burst({ freq: 70, type: 'sine', dur: 0.4, gain: 0.45, sweep: 0.35 }); }
  roar() {
    this._burst({ freq: 210, type: 'sawtooth', dur: 0.9, gain: 0.4, sweep: 0.22, filter: { type: 'lowpass', freq: 900 } });
    this._noiseBurst({ dur: 0.8, gain: 0.2, freq: 320, q: 0.9, sweepTo: 120 });
  }
  death() { this._burst({ freq: 260, type: 'sawtooth', dur: 0.8, gain: 0.32, sweep: 0.15, filter: { type: 'lowpass', freq: 700 } }); }
  wave() {
    if (!this.ctx || !this.enabled) return;
    [523, 659, 784].forEach((f, i) => setTimeout(() => this._burst({ freq: f, type: 'triangle', dur: 0.35, gain: 0.22, sweep: 1 }), i * 110));
  }
  pickup() { this._burst({ freq: 880, type: 'triangle', dur: 0.2, gain: 0.25, sweep: 1.6 }); }

  // Wildlife. A short rising blip per species, falling and longer when one
  // goes down, so a chicken and a dodo never sound alike.
  squawk(kind = 'ayam', down = false) {
    const base = kind === 'burung' ? 1180 : kind === 'ayam' ? 760 : kind === 'dodo' ? 300 : 210;
    this._burst({
      freq: base, type: kind === 'kurakura' ? 'sawtooth' : 'square',
      dur: down ? 0.34 : 0.13, gain: down ? 0.2 : 0.14,
      sweep: down ? 0.45 : 1.5, filter: { type: 'lowpass', freq: 2600 },
    });
  }

  flame(on) {
    if (!this.ctx || !this.enabled) { return; }
    if (on && !this._flame) {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.08);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 11;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 260;
      lfo.connect(lfoG).connect(f.frequency);
      src.connect(f).connect(g).connect(this.master);
      src.start(t); lfo.start(t);
      this._flame = { src, g, lfo };
    } else if (!on && this._flame) {
      const { src, g, lfo } = this._flame;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0002), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      src.stop(t + 0.2); lfo.stop(t + 0.2);
      this._flame = null;
    }
  }
}
