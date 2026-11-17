// audio.js — all sound is synthesised with WebAudio: no audio files are loaded.
// Engine hum, sirens, gunshots, punches, coins, jingles and a bassline loop.
(function () {
  'use strict';
  var U = window.SB.util;

  function SoundFX() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicStep = 0;
  }

  SoundFX.prototype.ensure = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  };

  SoundFX.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  };

  SoundFX.prototype.now = function () { return this.ctx ? this.ctx.currentTime : 0; };

  SoundFX.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  SoundFX.prototype.noise = function (dur, vol, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var len = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    var f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  };

  SoundFX.prototype.shot = function () { this.noise(0.16, 0.5, 2800, 'highpass'); this.blip(140, 0.1, 'square', 0.25, 60); };
  SoundFX.prototype.punch = function () { this.noise(0.09, 0.35, 500); this.blip(110, 0.08, 'sine', 0.3, 55); };
  SoundFX.prototype.coin = function () { this.blip(880, 0.09, 'sine', 0.22); var self = this; setTimeout(function () { self.blip(1320, 0.14, 'sine', 0.22); }, 70); };
  SoundFX.prototype.deny = function () { this.blip(180, 0.16, 'square', 0.18, 120); };
  SoundFX.prototype.click = function () { this.blip(660, 0.05, 'square', 0.12); };
  SoundFX.prototype.horn = function () { this.blip(370, 0.22, 'sawtooth', 0.16); this.blip(466, 0.22, 'sawtooth', 0.12); };
  SoundFX.prototype.crash = function () { this.noise(0.3, 0.4, 900); this.blip(90, 0.25, 'sine', 0.3, 40); };
  SoundFX.prototype.splash = function () { this.noise(0.5, 0.25, 1600, 'bandpass'); };
  SoundFX.prototype.jingle = function () {
    var self = this;
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { self.blip(f, 0.22, 'triangle', 0.25); }, i * 110);
    });
  };
  SoundFX.prototype.busted = function () {
    var self = this;
    [392, 330, 262].forEach(function (f, i) {
      setTimeout(function () { self.blip(f, 0.3, 'sawtooth', 0.2); }, i * 160);
    });
  };

  SoundFX.prototype.startEngine = function () {
    if (!this.ctx) return;
    var o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    var f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
    var g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engineOsc = o; this.engineFilter = f; this.engineGain = g;
  };

  SoundFX.prototype.setEngine = function (speed01, on) {
    if (!this.engineOsc) return;
    var t = this.ctx.currentTime;
    var target = on ? 0.05 + speed01 * 0.10 : 0.0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(350 + speed01 * 900, t, 0.1);
  };

  SoundFX.prototype.setSiren = function (on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      var o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 700;
      var lfo = this.ctx.createOscillator();
      lfo.type = 'square'; lfo.frequency.value = 1.4;
      var lg = this.ctx.createGain(); lg.gain.value = 240;
      lfo.connect(lg); lg.connect(o.frequency);
      var g = this.ctx.createGain(); g.gain.value = 0.045;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenOsc = o; this.sirenGain = g; this._sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this._sirenLfo.stop(); } catch (e) {}
      this.sirenOsc = null; this.sirenGain = null;
    }
    if (this.sirenGain) this.sirenGain.gain.value = (on && !this.muted) ? 0.045 : 0;
  };

  // A lazy two-bar bassline + kick, scheduled on a timer. Original, written here.
  SoundFX.prototype.startMusic = function () {
    if (!this.ctx || this.musicTimer) return;
    var self = this;
    var bass = [55, 0, 55, 65.4, 0, 55, 49, 58.3, 55, 0, 55, 65.4, 73.4, 0, 65.4, 49];
    this.musicTimer = setInterval(function () {
      if (self.muted || !self.ctx) return;
      var step = self.musicStep % 16;
      var f = bass[step];
      if (f) self.blip(f, 0.22, 'triangle', 0.16);
      if (step % 4 === 0) self.blip(120, 0.09, 'sine', 0.22, 45);
      if (step % 4 === 2) self.noise(0.04, 0.05, 6000, 'highpass');
      self.musicStep++;
    }, 240);
  };

  window.SB.SoundFX = SoundFX;
})();
