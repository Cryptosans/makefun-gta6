// hud.js — the HUD: cash, health, wanted stars, mission banner, dialogue,
// toasts, speedometer, the canvas minimap, and the menu overlays.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  function Hud(game) {
    this.game = game;
    this.map = U.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = null;
    this.sayTimer = null;
    this.bustShown = false;
  }

  Hud.prototype.setCash = function (cash) { U.el('cash').textContent = U.fmtCash(cash); };
  Hud.prototype.setHealth = function (hp) {
    var bar = U.el('health-fill');
    bar.style.width = Math.max(0, hp) + '%';
    bar.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
  };
  Hud.prototype.setStars = function (stars) {
    var s = '';
    for (var i = 0; i < C.maxWanted; i++) s += i < stars ? '★' : '☆';
    var el = U.el('stars');
    el.textContent = s;
    el.classList.toggle('hot', stars > 0);
  };
  Hud.prototype.setMissions = function (done, total) {
    U.el('mission-count').textContent = done + '/' + total + ' missions';
  };
  Hud.prototype.setSpeed = function (kmh, inCar, carName) {
    var el = U.el('speed');
    if (!inCar) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    U.el('speed-num').textContent = Math.round(Math.abs(kmh));
    U.el('speed-car').textContent = carName || '';
  };
  Hud.prototype.setPrompt = function (text) {
    var el = U.el('prompt');
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = text;
  };
  Hud.prototype.setTimer = function (sec) {
    var el = U.el('timer');
    if (!sec || sec <= 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = '⏱ ' + U.fmtTime(sec);
    el.classList.toggle('urgent', sec < 20);
  };
  Hud.prototype.setDistance = function (d) {
    var el = U.el('distance');
    if (d === undefined || d === null) { el.style.display = 'none'; return; }
    el.style.display = 'inline';
    el.textContent = Math.round(d) + 'm';
  };

  Hud.prototype.toast = function (text, kind) {
    var el = U.el('toast');
    el.textContent = text;
    el.className = 'show ' + (kind || '');
    clearTimeout(this.toastTimer);
    var self = this;
    this.toastTimer = setTimeout(function () { el.className = ''; }, 3600);
  };

  Hud.prototype.say = function (text) {
    var el = U.el('dialogue');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.sayTimer);
    var self = this;
    this.sayTimer = setTimeout(function () { el.classList.remove('show'); }, 4200);
  };

  Hud.prototype.showMission = function (def) {
    var el = U.el('mission-banner');
    U.el('mission-title').textContent = 'MISSION ' + def.id + ' — ' + def.title;
    U.el('mission-brief').textContent = def.brief;
    el.classList.add('show');
    this.setObjective(def.objective);
    var self = this;
    setTimeout(function () { el.classList.remove('show'); }, 5200);
  };

  Hud.prototype.showNextMission = function (def) {
    if (!def) return;
    var el = U.el('next-mission');
    U.el('next-mission-text').textContent = 'Next: ' + def.title + ' — press M to start';
    el.classList.add('show');
  };

  Hud.prototype.setObjective = function (text) {
    var el = U.el('objective');
    el.style.display = 'block';
    U.el('objective-text').textContent = text;
  };
  Hud.prototype.clearObjective = function () {
    U.el('objective').style.display = 'none';
    U.el('next-mission').classList.remove('show');
    this.setDistance(null);
  };

  Hud.prototype.flashDamage = function () {
    var el = U.el('damage');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };

  Hud.prototype.flashHit = function () {
    var el = U.el('hitmark');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };

  Hud.prototype.showBustMeter = function (frac) {
    var el = U.el('bust');
    if (frac > 0) {
      el.style.display = 'block';
      U.el('bust-fill').style.width = Math.round(frac * 100) + '%';
    } else {
      el.style.display = 'none';
    }
  };

  Hud.prototype.showComplete = function () {
    var el = U.el('complete');
    el.classList.add('show');
  };

  Hud.prototype.showOverlay = function (id) {
    ['start-screen', 'pause-screen', 'end-screen'].forEach(function (x) {
      U.el(x).classList.toggle('show', x === id);
    });
    U.el('hud').classList.toggle('hidden', id !== null);
  };

  Hud.prototype.showEnd = function (title, sub) {
    U.el('end-title').textContent = title;
    U.el('end-sub').textContent = sub;
    this.showOverlay('end-screen');
  };

  // ---- minimap ----
  Hud.prototype.drawMinimap = function () {
    var ctx = this.mapCtx;
    var S = 190;
    var scale = S / (C.worldSize + 40);
    function mx(x) { return (x + C.worldSize / 2 + 20) * scale; }
    function mz(z) { return (z + C.worldSize / 2 + 20) * scale; }
    ctx.clearRect(0, 0, S, S);
    // land
    ctx.fillStyle = '#7d9b5e';
    ctx.fillRect(0, 0, S, S);
    // beach + water
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, mz(C.beachZ), S, mz(C.waterZ) - mz(C.beachZ));
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, mz(C.waterZ), S, S - mz(C.waterZ));
    // roads
    ctx.fillStyle = '#3a3d42';
    C.roadCoords.forEach(function (c) {
      ctx.fillRect(mx(c) - 2.5, 0, 5, S);
      ctx.fillRect(0, mz(c) - 2.5, S, 5);
    });
    // pier
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(mx(-88), mz(C.beachZ), 3, mz(C.waterZ + 80) - mz(C.beachZ));
    var game = this.game;
    // cash pickups
    ctx.fillStyle = '#f2c14e';
    game.world.pickups.forEach(function (p) {
      if (!p.taken) { ctx.beginPath(); ctx.arc(mx(p.x), mz(p.z), 2.4, 0, 7); ctx.fill(); }
    });
    // mission marker
    if (game.missions.markerTarget) {
      var t = game.missions.markerTarget;
      var pulse = 5 + Math.sin(performance.now() * 0.006) * 1.6;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.arc(mx(t.x), mz(t.z), pulse, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a5b00';
      ctx.beginPath(); ctx.arc(mx(t.x), mz(t.z), 2.6, 0, 7); ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#e8e4da';
    game.traffic.cars.forEach(function (c) {
      ctx.fillRect(mx(c.model.position.x) - 1.5, mz(c.model.position.z) - 1.5, 3, 3);
    });
    // police
    ctx.fillStyle = '#3b82f6';
    game.police.cars.forEach(function (c) {
      ctx.beginPath(); ctx.arc(mx(c.model.position.x), mz(c.model.position.z), 3, 0, 7); ctx.fill();
    });
    ctx.fillStyle = '#2563eb';
    game.police.officers.forEach(function (o) {
      ctx.fillRect(mx(o.model.position.x) - 1.5, mz(o.model.position.z) - 1.5, 3, 3);
    });
    // player arrow
    var px = mx(game.player.x), pz = mz(game.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(game.player.inCar ? game.playerCar.angle : game.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(-4.4, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // north label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('N', 6, 12);
  };

  window.SB.Hud = Hud;
})();
