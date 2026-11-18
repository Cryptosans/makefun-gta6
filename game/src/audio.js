// audio.js — every sound in Solara Bay is synthesized with WebAudio.
// No audio files are shipped or fetched; oscillators and filtered noise
// cover the engine hum, gunshots, pickups, sirens, crashes and UI clicks.
// The context is created lazily on the first user gesture so browsers
// never block the page for autoplay.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.muted = false;
  }

  // Must be called from a user gesture (click / keydown) at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    // Continuous engine voice: two detuned saws through a low-pass.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 55.7;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Police siren voice: one triangle that alternates between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  // Called every frame: engine pitch follows speed, siren wails with heat.
  update(dt, speed, wanted) {
    if (!this.ctx) return;
    const target = speed > 0.5 ? 0.05 + Math.min(0.12, speed * 0.004) : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const freq = 48 + speed * 4.2;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.013, this.ctx.currentTime, 0.08);
    if (wanted > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = 0.42;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(
          this.sirenHigh ? 920 : 660, this.ctx.currentTime, 0.05);
      }
      this.sirenGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.2);
    } else {
      this.sirenGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);
    }
  }

  _noiseBurst(duration, filterFreq, gainValue) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  _tone(freq, duration, type, gainValue, slideTo) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    }
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.02);
  }

  shot() {
    this._noiseBurst(0.14, 2600, 0.5);
    this._tone(160, 0.09, 'square', 0.22, 60);
  }

  enemyShot() {
    this._noiseBurst(0.12, 1800, 0.28);
  }

  pickup() {
    this._tone(880, 0.09, 'sine', 0.3);
    setTimeout(() => this._tone(1318, 0.14, 'sine', 0.3), 70);
  }

  cash() {
    this._tone(1046, 0.08, 'sine', 0.28);
    setTimeout(() => this._tone(1568, 0.18, 'sine', 0.28), 80);
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.22, 'triangle', 0.3), i * 110);
    });
  }

  missionFail() {
    this._tone(320, 0.35, 'sawtooth', 0.22, 140);
  }

  crash() {
    this._noiseBurst(0.22, 500, 0.5);
    this._tone(90, 0.2, 'sine', 0.4, 45);
  }

  punch() {
    this._noiseBurst(0.08, 900, 0.35);
  }

  click() {
    this._tone(660, 0.06, 'sine', 0.2);
  }

  door() {
    this._noiseBurst(0.1, 1200, 0.2);
    this._tone(220, 0.08, 'triangle', 0.15, 180);
  }

  wantedUp() {
    this._tone(440, 0.12, 'square', 0.18, 880);
  }
}
