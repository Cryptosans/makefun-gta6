// Solara Bay — all sound is synthesized with WebAudio. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = false;
    this.musicTimer = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.noiseBuffer = null;
  }

  // Must be called from a user gesture (start button).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._startEngine();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _startEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2); g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
  }

  // speed01: 0..1, on: whether the player is driving.
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 52 + speed01 * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, t, 0.1);
  }

  _blip(freq, dur, type = 'sine', vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  click() { this._blip(880, 0.07, 'triangle', 0.18); }
  pickup() { this._blip(660, 0.09, 'sine', 0.25); this._blip(990, 0.14, 'sine', 0.25, 0.08); }
  cash() { this._blip(1320, 0.08, 'triangle', 0.2); this._blip(1760, 0.12, 'triangle', 0.2, 0.07); }
  gunshot() { this._noise(0.16, 0.5, 900); this._blip(140, 0.1, 'square', 0.3); }
  crash() { this._noise(0.35, 0.55, 500); this._blip(70, 0.3, 'sawtooth', 0.35); }
  thud() { this._noise(0.12, 0.3, 300); }
  horn() { this._blip(370, 0.28, 'square', 0.14); this._blip(466, 0.28, 'square', 0.12); }
  wantedUp() { this._blip(220, 0.16, 'sawtooth', 0.22); this._blip(174, 0.24, 'sawtooth', 0.22, 0.14); }
  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => this._blip(f, 0.22, 'triangle', 0.25, i * 0.11));
  }
  missionFail() { [392, 330, 262].forEach((f, i) => this._blip(f, 0.3, 'sawtooth', 0.2, i * 0.16)); }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      this.sirenOsc.connect(this.sirenGain);
      if (pan) { this.sirenGain.connect(pan); pan.connect(this.master); }
      else this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer); this.sirenTimer = null;
      const osc = this.sirenOsc, g = this.sirenGain;
      this.sirenOsc = null; this.sirenGain = null;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { try { osc.stop(); } catch (e) {} }, 300);
    }
  }

  // A lazy synthwave pad: root notes cycle every bar, scheduled ahead.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const roots = [55, 65.41, 49, 58.27]; // A1 C2 G1 Bb1
    let step = 0;
    const tick = () => {
      if (!this.ctx || this.muted && false) return;
      const root = roots[step % roots.length];
      step++;
      const notes = [root, root * 1.5, root * 2, root * 2.52];
      for (const f of notes) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass'; flt.frequency.value = 700;
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.028, t + 0.6);
        g.gain.setValueAtTime(0.028, t + 2.6);
        g.gain.linearRampToValueAtTime(0.0001, t + 3.9);
        o.connect(flt); flt.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 4);
      }
      // Soft kick on the beat.
      for (let i = 0; i < 4; i++) {
        const t = this.ctx.currentTime + i * 0.95;
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.25);
      }
    };
    tick();
    this.musicTimer = setInterval(tick, 3800);
  }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.setSiren(false);
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
