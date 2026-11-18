// hud.js — DOM HUD (cash, health, wanted stars, clock, objective, timer,
// toasts, compass) + a live 2D-canvas minimap.
import { fmtCash, fmtClock, fmtTime, clamp } from './utils.js';
import { ROAD_COORDS } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      cash: document.getElementById('hud-cash'),
      healthFill: document.getElementById('hud-health-fill'),
      healthText: document.getElementById('hud-health-text'),
      stars: document.getElementById('hud-stars'),
      clock: document.getElementById('hud-clock'),
      objective: document.getElementById('hud-objective'),
      missionName: document.getElementById('hud-mission-name'),
      timer: document.getElementById('hud-timer'),
      ammo: document.getElementById('hud-ammo'),
      toast: document.getElementById('hud-toast'),
      compass: document.getElementById('hud-compass'),
      prompt: document.getElementById('hud-prompt'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTimer = null;
    this.last = {};
  }
  setText(key, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    const el = this.el[key];
    if (el) el.textContent = value;
  }
  update(state) {
    // state: {cash, health, wanted, clockMinutes, objective, missionName,
    //  timeLeft, ammo, reloading, prompt, beaconAngle, beaconDist}
    this.setText('cash', fmtCash(state.cash));
    const hp = Math.round(clamp(state.health, 0, 100));
    if (this.el.healthFill) this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.style.background = hp > 50 ? '#2ecc71' : hp > 25 ? '#f39c12' : '#e74c3c';
    this.setText('healthText', hp + ' HP');
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    this.setText('stars', stars);
    if (this.el.stars) this.el.stars.style.color = state.wanted > 0 ? '#ffcf3f' : '#888888';
    this.setText('clock', fmtClock(state.clockMinutes));
    this.setText('objective', state.objective || '');
    this.setText('missionName', state.missionName || 'Solara Bay');
    this.setText('timer', state.timeLeft > 0 ? '⏱ ' + fmtTime(state.timeLeft) : '');
    this.setText('ammo', state.reloading ? 'Reloading…' : 'Ammo ' + state.ammo + '/12');
    this.setText('prompt', state.prompt || '');
    if (this.el.compass) {
      const deg = Math.round((((state.beaconAngle || 0) * 180) / Math.PI + 360) % 360);
      this.el.compass.textContent = state.beaconDist != null
        ? '◆ ' + deg + '° · ' + Math.round(state.beaconDist) + 'm'
        : '◆ —';
    }
  }
  toast(msg, ms = 3500) {
    if (!this.el.toast) return;
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }
  // Live minimap: roads, beach/ocean, plaza, player, traffic, police, beacon.
  drawMinimap(world) {
    if (!this.mapCtx || !this.el.minimap) return;
    const ctx = this.mapCtx;
    const S = 180; // canvas pixels
    const scale = S / 240; // world -120..120 -> 0..180
    const toMap = (x, z) => [(x + 120) * scale, (z + 120) * scale];
    ctx.clearRect(0, 0, S, S);
    // Land.
    ctx.fillStyle = '#3d6b34';
    ctx.fillRect(0, 0, S, S);
    // Ocean (east).
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect((100 + 120) * scale, 0, S - (100 + 120) * scale, S);
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect((98 + 120) * scale, 0, 4, S);
    // Roads.
    ctx.strokeStyle = '#333338';
    ctx.lineWidth = 5;
    for (const c of ROAD_COORDS) {
      const [x1, y1] = toMap(c, -110);
      const [x2, y2] = toMap(c, 110);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-110, c);
      const [x4, y4] = toMap(110, c);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Plaza.
    const [px, pz] = toMap(0, 0);
    ctx.fillStyle = '#b8b0a0';
    ctx.beginPath(); ctx.arc(px, pz, 7, 0, Math.PI * 2); ctx.fill();
    // Mission beacon (pulsing yellow diamond).
    if (world.beacon) {
      const [bx, bz] = toMap(world.beacon.x, world.beacon.z);
      const pulse = 5 + Math.sin(Date.now() / 200) * 2;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(bx, bz - pulse); ctx.lineTo(bx + pulse, bz); ctx.lineTo(bx, bz + pulse); ctx.lineTo(bx - pulse, bz);
      ctx.closePath(); ctx.fill();
    }
    // Traffic (white dots).
    ctx.fillStyle = '#ffffff';
    for (const t of world.traffic || []) {
      const [tx, tz] = toMap(t.x, t.z);
      ctx.fillRect(tx - 1.5, tz - 1.5, 3, 3);
    }
    // Police (blue/red flashing dots).
    const flashBlue = Math.floor(Date.now() / 300) % 2 === 0;
    ctx.fillStyle = flashBlue ? '#3388ff' : '#ff3333';
    for (const c of world.police || []) {
      const [cx, cz] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(cx, cz, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Enemies (purple dots).
    ctx.fillStyle = '#c060ff';
    for (const e of world.enemies || []) {
      const [ex, ez] = toMap(e.x, e.z);
      ctx.beginPath(); ctx.arc(ex, ez, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player (green arrow, rotated by heading).
    const [ux, uz] = toMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(ux, uz);
    ctx.rotate(world.playerHeading || 0);
    ctx.fillStyle = '#2eff5e';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 13);
  }
}
