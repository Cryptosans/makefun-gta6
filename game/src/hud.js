// Solara Bay — HUD: DOM readouts plus a live 2D minimap of the whole city.
import { fmtCash, fmtTime, clamp } from './utils.js';
import { streetCoords, HALF, CITY_BOUND } from './city.js';

const MAP_RANGE = CITY_BOUND + 20; // world units shown from centre to edge

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['cash-value', 'health-fill', 'health-text', 'wanted', 'clock',
      'mission-title', 'objective-text', 'objective-timer', 'compass-arrow', 'compass-dist',
      'minimap', 'speedo', 'speed-value', 'crosshair', 'banner', 'toast', 'interact',
      'interact-label', 'damage-flash', 'crack-bar', 'crack-fill']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el['minimap'].getContext('2d');
    this.bannerTimer = null;
    this.toastTimer = null;
    this.el['wanted'].querySelectorAll('.star').forEach((s) => (s.className = 'star'));
  }

  setObjective(title, text) {
    this.el['mission-title'].textContent = title;
    this.el['objective-text'].textContent = text;
  }

  setTimer(seconds) {
    this.el['objective-timer'].textContent = seconds === null ? '' : `⏱ ${fmtTime(seconds)}`;
    this.el['objective-timer'].style.color = seconds !== null && seconds < 30 ? '#ff6b6b' : '#ffd75e';
  }

  setCrack(frac) {
    if (frac === null) { this.el['crack-bar'].classList.add('hidden'); return; }
    this.el['crack-bar'].classList.remove('hidden');
    this.el['crack-fill'].style.width = `${clamp(frac * 100, 0, 100)}%`;
  }

  banner(text, ms = 2600) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
  }

  toast(text, ms = 4200) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  showInteract(label) {
    if (!label) { this.el.interact.classList.add('hidden'); return; }
    this.el['interact-label'].textContent = label;
    this.el.interact.classList.remove('hidden');
  }

  damageFlash() {
    const f = this.el['damage-flash'];
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 140);
  }

  flashWanted() {
    this.el.wanted.style.transform = 'scale(1.25)';
    setTimeout(() => { this.el.wanted.style.transform = ''; }, 200);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.el['cash-value'].textContent = fmtCash(g.cash);
    const hp = Math.max(0, Math.round(p.health));
    this.el['health-fill'].style.width = `${hp}%`;
    this.el['health-text'].textContent = hp;
    // Wanted stars.
    const stars = this.el.wanted.querySelectorAll('.star');
    stars.forEach((s, i) => {
      s.classList.toggle('lit', i < g.police.stars);
      s.classList.toggle('hot', i < g.police.stars && g.police.stars >= 4);
    });
    // Clock: one game hour per 100 real seconds, starting 12:00.
    const mins = (12 * 60 + Math.floor(g.elapsed * 0.6)) % 1440;
    this.el.clock.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    // Speedometer.
    if (p.inCar && p.car) {
      this.el.speedo.classList.remove('hidden');
      this.el['speed-value'].textContent = Math.round(Math.abs(p.car.speed) * 3.6);
      this.el.crosshair.classList.add('hidden');
    } else {
      this.el.speedo.classList.add('hidden');
      this.el.crosshair.classList.remove('hidden');
    }
    // Compass arrow toward the mission marker.
    const m = g.missions.marker;
    if (m) {
      const dx = m.x - p.x, dz = m.z - p.z;
      const worldAngle = Math.atan2(dx, dz);
      const rel = worldAngle - g.cameraYaw;
      this.el['compass-arrow'].style.transform = `rotate(${rel}rad)`;
      this.el['compass-dist'].textContent = `${Math.round(Math.hypot(dx, dz))}m`;
      this.el['compass-arrow'].style.visibility = 'visible';
      this.el['compass-dist'].style.visibility = 'visible';
    } else {
      this.el['compass-arrow'].style.visibility = 'hidden';
      this.el['compass-dist'].style.visibility = 'hidden';
    }
    this._drawMinimap();
  }

  _toMap(x, z) {
    const s = 200 / (MAP_RANGE * 2);
    return [100 + x * s, 100 + z * s];
  }

  _drawMinimap() {
    const ctx = this.mapCtx;
    const g = this.game;
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillStyle = '#0d1526';
    ctx.beginPath(); ctx.arc(100, 100, 98, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(100, 100, 98, 0, Math.PI * 2); ctx.clip();
    // Water (bay, east).
    const [wx] = this._toMap(HALF + 60, 0);
    ctx.fillStyle = '#1f7fa8';
    ctx.fillRect(wx, 0, 200 - wx, 200);
    // Sand.
    const [sx] = this._toMap(HALF + 8, 0);
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect(sx, 0, wx - sx, 200);
    // Roads.
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 4;
    for (const s of streetCoords()) {
      const [a] = this._toMap(s, 0);
      ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, 200); ctx.stroke();
      const [, b] = this._toMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(200, b); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#5a6274';
    for (const c of g.city.colliders) {
      const [x1, y1] = this._toMap(c.minX, c.minZ);
      const [x2, y2] = this._toMap(c.maxX, c.maxZ);
      ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
    }
    // Pier.
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 3;
    const [px1, py] = this._toMap(HALF + 55, 0);
    const [px2] = this._toMap(HALF + 125, 0);
    ctx.beginPath(); ctx.moveTo(px1, py); ctx.lineTo(px2, py); ctx.stroke();
    const dot = (x, z, color, r = 2) => {
      const [mx, my] = this._toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // Mission marker — pulsing yellow.
    const m = g.missions.marker;
    if (m) {
      const pulse = 3 + Math.sin(g.elapsed * 5) * 1.5;
      dot(m.x, m.z, '#ffd75e', pulse + 2);
      const [mx, my] = this._toMap(m.x, m.z);
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, pulse + 6, 0, Math.PI * 2); ctx.stroke();
    }
    for (const ped of g.peds.list) if (ped.state !== 'down') dot(ped.x, ped.z, '#9aa0aa', 1.2);
    for (const e of g.combat.gang) if (e.health > 0) dot(e.x, e.z, '#ff4040', 2.4);
    for (const c of g.traffic.cars) dot(c.x, c.z, '#e8e8e8', 1.8);
    const flash = Math.floor(g.elapsed * 4) % 2 === 0;
    for (const c of g.police.cars) dot(c.x, c.z, flash ? '#ff3030' : '#3050ff', 2.6);
    for (const c of g.police.cops) dot(c.x, c.z, '#3050ff', 2.2);
    // Player arrow.
    const [px, py2] = this._toMap(g.player.x, g.player.z);
    ctx.save();
    ctx.translate(px, py2);
    ctx.rotate(Math.PI - g.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 96, 12);
  }
}
