/**
 * Background music - synthesised, no audio files.
 *
 * A look-ahead scheduler walks 16th-note steps and asks the selected style to
 * lay down notes a fraction of a second before they are due, which keeps the
 * timing off the main thread's frame rate.
 *
 * Each style writes into four layers that fade in with `intensity`, so the
 * same track is calm between waves, fuller while fighting, and heaviest when a
 * matriarch is on the field:
 *
 *   base  always on        pad / bass
 *   perc  intensity > 0.25 drums
 *   lead  intensity > 0.50 melody
 *   boss  intensity > 0.85 extra low end
 *
 * The scheduling functions are pure with respect to time, so the whole thing
 * can also be rendered into an OfflineAudioContext (used by the tests).
 */

const LOOKAHEAD = 0.25;      // seconds of notes scheduled in advance
const TICK = 40;             // ms between scheduler wake-ups
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// `trim` levels the styles: measured offline, Jurassic Stomp renders about
// twice the RMS of Synthwave, so they need matching before anyone A/Bs them.
export const STYLES = {
  ceria: { label: 'Padang Ceria', trim: 1.0 },
  stomp: { label: 'Jurassic Stomp', trim: 0.78 },
  chip: { label: 'Chiptune Rampage', trim: 1.2 },
  synth: { label: 'Synthwave Predator', trim: 1.35 },
};

export class Music {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);

    this.layers = {};
    for (const name of ['base', 'perc', 'lead', 'boss']) {
      const g = ctx.createGain();
      g.gain.value = name === 'base' ? 1 : 0.0001;
      g.connect(this.out);
      this.layers[name] = g;
    }
    // a little space so the pads do not sound bone dry
    this.style = 'ceria';
    this.playing = false;
    this.intensity = 0.3;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.volume = 0.5;
  }

  // ------------------------------------------------------------- voices ----
  _env(gain, t, a, d, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _tone(layer, t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, detune = 0, filter = 0, q = 1 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);
    const g = ctx.createGain();
    this._env(g, t, attack, dur, gain);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t);
      f.Q.value = q;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.layers[layer]);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
  }

  /** Marimba/kalimba-ish: a sine with a bright partial and a fast decay. */
  _pluck(layer, t, freq, dur = 0.35, gain = 0.22) {
    this._tone(layer, t, freq, dur, { type: 'sine', gain, attack: 0.004 });
    this._tone(layer, t, freq * 2.01, dur * 0.45, { type: 'sine', gain: gain * 0.35, attack: 0.003 });
  }

  _bass(layer, t, freq, dur = 0.22, gain = 0.3) {
    this._tone(layer, t, freq, dur, { type: 'triangle', gain, attack: 0.008, filter: 620, q: 3 });
  }

  _pad(layer, t, freqs, dur = 1.6, gain = 0.07) {
    for (const f of freqs) {
      this._tone(layer, t, f, dur, { type: 'sawtooth', gain, attack: 0.28, filter: 900, q: 0.8 });
      this._tone(layer, t, f, dur, { type: 'sawtooth', gain: gain * 0.7, attack: 0.3, detune: 9, filter: 800 });
    }
  }

  _stab(layer, t, freqs, dur = 0.26, gain = 0.16) {
    for (const f of freqs) {
      this._tone(layer, t, f, dur, { type: 'sawtooth', gain, attack: 0.012, filter: 1500, q: 2 });
    }
  }

  _square(layer, t, freq, dur = 0.16, gain = 0.13) {
    this._tone(layer, t, freq, dur, { type: 'square', gain, attack: 0.003, filter: 2600 });
  }

  _noise(layer, t, dur, { gain = 0.2, freq = 1800, type = 'highpass', q = 0.8 } = {}) {
    const ctx = this.ctx;
    if (!this._noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, 0.003, dur, gain);
    src.connect(f).connect(g).connect(this.layers[layer]);
    src.start(t);
    src.stop(t + dur + 0.08);
  }

  _kick(layer, t, gain = 0.5, from = 150, to = 45, dur = 0.26) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const g = ctx.createGain();
    this._env(g, t, 0.004, dur, gain);
    osc.connect(g).connect(this.layers[layer]);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _tom(layer, t, from = 260, gain = 0.3) {
    this._kick(layer, t, gain, from, from * 0.45, 0.3);
  }

  _snare(layer, t, gain = 0.22) {
    this._noise(layer, t, 0.16, { gain, freq: 1900, type: 'highpass' });
    this._tone(layer, t, 180, 0.1, { type: 'triangle', gain: gain * 0.5 });
  }

  _hat(layer, t, gain = 0.07, dur = 0.05) {
    this._noise(layer, t, dur, { gain, freq: 7500, type: 'highpass' });
  }

  // -------------------------------------------------------------- styles ----
  get bpm() {
    return { ceria: 112, stomp: 96, chip: 152, synth: 106 }[this.style] || 112;
  }

  /** Lays down every note that falls on `step` (16ths) at absolute time `t`. */
  _scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const i = step % 16;
    const fn = this[`_style_${this.style}`];
    if (fn) fn.call(this, i, bar, t);
  }

  // 1. bright, bouncy, major pentatonic over I-vi-IV-V
  _style_ceria(i, bar, t) {
    const roots = [60, 57, 65, 67];
    const root = roots[bar];

    if (i === 0) this._pad('base', t, [midi(root - 12), midi(root - 5), midi(root)], 1.9, 0.055);
    if ([0, 3, 6, 8, 11, 14].includes(i)) {
      this._bass('base', t, midi(root - 24 + (i === 6 || i === 14 ? 7 : 0)), 0.2, 0.26);
    }

    if (i % 4 === 0) this._kick('perc', t, 0.4);
    if (i === 4 || i === 12) this._snare('perc', t, 0.16);
    if (i % 2 === 1) this._hat('perc', t, 0.05);
    if ([2, 7, 10, 15].includes(i)) this._tom('perc', t, 210 + (i % 3) * 40, 0.16);

    const mel = [
      [0, null, 4, null, 7, null, 4, 2, 0, null, 2, null, 4, null, 2, null],
      [9, null, 7, null, 4, null, 7, null, 9, null, 11, null, 9, null, 7, null],
      [4, null, 7, null, 9, null, 7, 4, 2, null, 4, null, 7, null, 9, null],
      [7, null, 9, null, 11, null, 9, 7, 4, null, 7, null, 9, null, 11, 12],
    ][bar];
    const d = mel[i];
    if (d !== null && d !== undefined) this._pluck('lead', t, midi(root + 12 + d), 0.34, 0.17);
    if (i === 0 || i === 8) this._bass('boss', t, midi(root - 36), 0.5, 0.3);
  }

  // 2. heavy tribal percussion, minor stabs, very little melody
  _style_stomp(i, bar, t) {
    const roots = [45, 45, 48, 43];
    const root = roots[bar];

    if (i === 0) this._pad('base', t, [midi(root - 12), midi(root - 5)], 2.2, 0.06);
    if ([0, 6, 10].includes(i)) this._bass('base', t, midi(root - 12), 0.32, 0.3);

    if ([0, 3, 8, 11].includes(i)) this._kick('perc', t, 0.55, 170, 42, 0.3);
    if ([4, 12].includes(i)) this._tom('perc', t, 150, 0.4);
    if ([2, 6, 10, 14].includes(i)) this._tom('perc', t, 240, 0.22);
    if (i === 15 && bar % 2 === 1) { this._tom('perc', t, 300, 0.3); }
    if (i % 4 === 2) this._hat('perc', t, 0.045, 0.04);

    if ([0, 8].includes(i)) this._stab('lead', t, [midi(root), midi(root + 3), midi(root + 7)], 0.34, 0.12);
    if (i === 14 && bar === 3) this._stab('lead', t, [midi(root + 5), midi(root + 8)], 0.28, 0.1);

    if (i % 8 === 0) this._kick('boss', t, 0.5, 90, 32, 0.6);
    if ([5, 13].includes(i)) this._tom('boss', t, 120, 0.3);
  }

  // 3. fast arcade chiptune
  _style_chip(i, bar, t) {
    const roots = [60, 63, 58, 60];
    const root = roots[bar];
    const arp = [0, 4, 7, 12, 7, 4];

    this._square('base', t, midi(root - 24 + (i % 8 === 4 ? 7 : 0)), 0.09, 0.12);
    if (i % 2 === 0) this._square('base', t, midi(root + arp[(i / 2) % arp.length]), 0.07, 0.05);

    if (i % 4 === 0) this._kick('perc', t, 0.4, 130, 48, 0.18);
    if (i === 4 || i === 12) this._snare('perc', t, 0.2);
    this._hat('perc', t, i % 2 ? 0.035 : 0.055, 0.035);

    const mel = [
      [12, 12, null, 11, 12, null, 14, null, 16, null, 14, 12, 11, null, 9, null],
      [16, null, 14, null, 12, null, 11, 12, 14, null, 12, null, 9, null, 7, null],
      [7, 9, 11, 12, 14, null, 12, null, 11, null, 9, null, 7, null, 4, null],
      [12, 14, 16, 19, 16, 14, 12, 11, 12, null, 16, null, 19, null, 21, null],
    ][bar];
    const d = mel[i];
    if (d !== null && d !== undefined) this._square('lead', t, midi(root + d), 0.11, 0.1);
    if (i % 8 === 0) this._square('boss', t, midi(root - 36), 0.2, 0.14);
  }

  // 4. pulsing synthwave
  _style_synth(i, bar, t) {
    const roots = [50, 48, 53, 55];
    const root = roots[bar];
    const arp = [0, 0, 12, 0, 7, 0, 12, 0];

    if (i === 0) this._pad('base', t, [midi(root), midi(root + 3), midi(root + 7), midi(root + 10)], 2.1, 0.05);
    this._tone('base', t, midi(root - 12 + arp[i % arp.length]), 0.12, { type: 'sawtooth', gain: 0.16, attack: 0.004, filter: 700 + (i % 4) * 260, q: 6 });

    if (i % 8 === 0) this._kick('perc', t, 0.45, 140, 44, 0.24);
    if (i === 4 || i === 12) { this._snare('perc', t, 0.2); this._noise('perc', t + 0.06, 0.12, { gain: 0.08, freq: 2400, type: 'highpass' }); }
    if (i % 2 === 1) this._hat('perc', t, 0.04, 0.045);

    const mel = [
      [null, null, 12, null, null, 15, null, null, 14, null, null, 12, null, null, 10, null],
      [12, null, null, 10, null, null, 8, null, null, 7, null, null, 10, null, 12, null],
      [15, null, null, 17, null, null, 15, null, null, 12, null, null, 10, null, null, null],
      [19, null, null, 17, null, null, 15, null, 12, null, null, 15, null, null, 17, 19],
    ][bar];
    const d = mel[i];
    if (d !== null && d !== undefined) {
      this._tone('lead', t, midi(root + d), 0.5, { type: 'sawtooth', gain: 0.075, attack: 0.03, filter: 2200, q: 1.5 });
    }
    if (i % 4 === 0) this._tone('boss', t, midi(root - 24), 0.3, { type: 'sawtooth', gain: 0.14, attack: 0.01, filter: 340, q: 4 });
  }

  // ------------------------------------------------------------ transport ----
  _pump() {
    const ctx = this.ctx;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (this.nextTime > ctx.currentTime - 0.05) this._scheduleStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (16 * 4);
      this.nextTime += stepDur;
    }
  }

  setStyle(style) {
    if (style === this.style) return;
    this.style = style;
    this.step = 0;
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    if (this.playing) this._rampOut(this.volume);   // re-level for the new style
  }

  setVolume(v) {
    this.volume = v;
    if (this.playing) this._rampOut(v);
  }

  _rampOut(v) {
    v *= (STYLES[this.style] && STYLES[this.style].trim) || 1;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(this.out.gain.value, 0.0001), t);
    this.out.gain.linearRampToValueAtTime(v, t + 0.6);   // linear: a fade-in must be audible early
  }

  start() {
    if (this.playing || !this.style || this.style === 'off') return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this._rampOut(this.volume);
    this._pump();
    this.timer = setInterval(() => this._pump(), TICK);
  }

  stop(fade = 0.5) {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(this.out.gain.value, 0.0001), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
  }

  /** 0 = menu calm, 0.6 = fighting, 1 = boss on the field. */
  setIntensity(v) {
    this.intensity = v;
    const t = this.ctx.currentTime;
    // setTargetAtTime converges on repeated calls; an exponential ramp from
    // near-zero spends its whole length inaudible and never gets there.
    const set = (name, target) => {
      const g = this.layers[name].gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(target, t, 0.45);
    };
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    set('perc', clamp01((v - 0.22) / 0.3));
    set('lead', clamp01((v - 0.45) / 0.3));
    set('boss', clamp01((v - 0.8) / 0.2));
  }

  /** Test hook: schedule `seconds` of music straight into an offline context. */
  renderAll(seconds, intensity = 1) {
    for (const name of ['perc', 'lead', 'boss']) this.layers[name].gain.value = intensity;
    this.out.gain.value = this.volume * ((STYLES[this.style] && STYLES[this.style].trim) || 1);
    const stepDur = 60 / this.bpm / 4;
    let t = 0.05;
    let step = 0;
    while (t < seconds) {
      this._scheduleStep(step, t);
      step = (step + 1) % (16 * 4);
      t += stepDur;
    }
  }
}
