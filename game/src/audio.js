// Solara Bay — all sound is synthesized with WebAudio: no audio files, no
// network. Engine hum, siren, gunshot, punch, pickup blip, mission jingle.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._engineOsc = null;
    this._engineOsc2 = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenTimer = 0;
    this._sirenHigh = false;
  }

  /** Must be called from a user gesture (start button / first key). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineOsc2 = this.ctx.createOscillator();
    this._engineOsc2.type = 'sawtooth';
    this._engineOsc2.frequency.value = 82;
    this._engineOsc.connect(filter);
    this._engineOsc2.connect(filter);
    filter.connect(this._engineGain);
    this._engineGain.connect(this.master);
    this._engineOsc.start();
    this._engineOsc2.start();

    // Police siren: one triangle osc, frequency flipped on a timer.
    this._sirenGain = this.ctx.createGain();
    this._sirenGain.gain.value = 0;
    this._sirenOsc = this.ctx.createOscillator();
    this._sirenOsc.type = 'triangle';
    this._sirenOsc.frequency.value = 720;
    this._sirenOsc.connect(this._sirenGain);
    this._sirenGain.connect(this.master);
    this._sirenOsc.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** Per-frame: engine pitch from speed (0..1), siren on/off by wanted. */
  update(dt, speedNorm, wanted) {
    if (!this.ctx) return;
    if (this._engineGain) {
      const target = speedNorm > 0.02 ? 0.05 + speedNorm * 0.11 : 0;
      this._engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      const f = 48 + speedNorm * 130;
      this._engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this._engineOsc2.frequency.setTargetAtTime(f * 1.5, this.ctx.currentTime, 0.05);
    }
    if (this._sirenGain) {
      if (wanted > 0) {
        this._sirenTimer -= dt;
        if (this._sirenTimer <= 0) {
          this._sirenTimer = 0.55;
          this._sirenHigh = !this._sirenHigh;
          this._sirenOsc.frequency.setTargetAtTime(
            this._sirenHigh ? 880 : 620, this.ctx.currentTime, 0.03);
        }
        this._sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.1);
      } else {
        this._sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
    }
  }

  _tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, lowFreq = 800) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  blip() { this._tone(880, 0.12, 'sine', 0.25); this._tone(1318, 0.14, 'sine', 0.18, 0.07); }
  punch() { this._noise(0.09, 0.5, 500); this._tone(140, 0.1, 'square', 0.2); }
  shot() { this._noise(0.16, 0.6, 2600); this._tone(220, 0.08, 'square', 0.15); }
  crash() { this._noise(0.35, 0.5, 400); }
  steal() { this._tone(520, 0.1, 'square', 0.15); this._tone(392, 0.16, 'square', 0.15, 0.09); }
  sirenBlip() { this._tone(980, 0.18, 'triangle', 0.2); }
  missionStart() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.18, 'sine', 0.22, i * 0.1)); }
  missionComplete() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.22, i * 0.11));
  }
  busted() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.16, i * 0.16)); }
  cash() { this._tone(1568, 0.1, 'sine', 0.2); this._tone(2093, 0.2, 'sine', 0.2, 0.08); }
}
