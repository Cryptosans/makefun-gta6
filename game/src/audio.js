// audio.js — all sound is synthesized with WebAudio. No audio files.
import { clamp } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.muted = false;
    this.started = false;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine loop: two detuned saws through a lowpass.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 28;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter);
      osc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      osc2.start();
      this.engineOsc2 = osc2;
      // Siren loop: sine that alternates pitch.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.started = true;
      return true;
    } catch (e) {
      return false;
    }
  }
  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.05 + 0.09 * clamp(speedNorm, 0, 1) : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + 130 * clamp(speedNorm, 0, 1), this.ctx.currentTime, 0.1);
    if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(28 + 60 * clamp(speedNorm, 0, 1), this.ctx.currentTime, 0.1);
  }
  setSiren(on, dt) {
    if (!this.ctx || !this.sirenOsc) return;
    this.sirenTimer += dt;
    const f = Math.sin(this.sirenTimer * 4.5) > 0 ? 920 : 640;
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0.0, this.ctx.currentTime, 0.2);
  }
  blip(freq, dur, type = 'sine', vol = 0.18) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }
  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  }
  gunshot() { this.noise(0.16, 0.5, 2600); this.blip(160, 0.08, 'square', 0.12); }
  enemyShot() { this.noise(0.12, 0.16, 1800); }
  pickup() { this.blip(880, 0.09); setTimeout(() => this.blip(1320, 0.12), 70); }
  cash() { this.blip(1046, 0.08); setTimeout(() => this.blip(1568, 0.14), 80); }
  missionStart() { this.blip(523, 0.12); setTimeout(() => this.blip(659, 0.12), 110); setTimeout(() => this.blip(784, 0.2), 220); }
  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18), i * 110));
  }
  missionFail() { this.blip(220, 0.25, 'sawtooth', 0.15); setTimeout(() => this.blip(165, 0.35, 'sawtooth', 0.15), 180); }
  punch() { this.noise(0.08, 0.25, 500); }
  hurt() { this.blip(110, 0.15, 'sawtooth', 0.18); }
  carDoor() { this.noise(0.09, 0.2, 700); this.blip(90, 0.08, 'square', 0.1); }
  skid() { this.noise(0.18, 0.1, 900); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
