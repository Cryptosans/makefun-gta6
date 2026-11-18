// hud.js — the HUD and the live minimap.
// DOM elements live in index.html; this module updates the cash, health,
// wanted stars, clock and objective text, flashes centre messages, and
// draws a top-down minimap on a 2D canvas every frame.

import { money, clockString, clamp } from './utils.js';

export class Hud {
  constructor(world) {
    this.world = world;
    this.cashEl = document.getElementById('cash');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.starsEl = document.getElementById('stars');
    this.clockEl = document.getElementById('clock');
    this.objectiveEl = document.getElementById('objective');
    this.messageEl = document.getElementById('message');
    this.speedEl = document.getElementById('speed');
    this.interactEl = document.getElementById('interact');
    this.minimap = document.getElementById('minimap');
    this.miniCtx = this.minimap.getContext('2d');
    this.vignette = document.getElementById('vignette');
    this.messageTimer = 0;
    this._lastStars = -1;
  }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  flashMessage(text, color) {
    this.messageEl.textContent = text;
    this.messageEl.style.color = color || '#ffffff';
    this.messageEl.style.opacity = '1';
    this.messageTimer = 3.2;
  }

  showInteract(text) {
    this.interactEl.textContent = text;
    this.interactEl.style.display = 'block';
  }

  hideInteract() {
    this.interactEl.style.display = 'none';
  }

  update(dt) {
    const state = this.world.state;
    this.cashEl.textContent = money(state.cash);
    const health = clamp(Math.round(state.health), 0, 100);
    this.healthFill.style.width = health + '%';
    this.healthFill.style.background = health > 50 ? '#3ddc5a' : health > 25 ? '#ffcc33' : '#ff3333';
    this.healthText.textContent = health;
    this.clockEl.textContent = clockString(state.timeMinutes);
    if (state.wanted !== this._lastStars) {
      this._lastStars = state.wanted;
      let stars = '';
      for (let i = 0; i < 5; i++) {
        stars += i < state.wanted ? '★' : '☆';
      }
      this.starsEl.textContent = stars;
      this.starsEl.style.color = state.wanted > 0 ? '#ffd94d' : '#888888';
    }
    const speed = this.world.playerCar
      ? Math.abs(Math.round(this.world.playerCar.speed * 3.6))
      : 0;
    this.speedEl.textContent = this.world.playerCar ? speed + ' km/h' : '';
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
    // Red flash at low health.
    const lowHealth = health < 30 ? (0.35 + Math.sin(this.world.elapsed * 6) * 0.15) : 0;
    this.vignette.style.opacity = String(lowHealth);
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this.miniCtx;
    const size = 170;
    const scale = size / 300; // world spans roughly -150..150
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.clearRect(0, 0, size, size);
    // Sea and sand at the bottom edge.
    ctx.fillStyle = '#0e4a72';
    ctx.fillRect(0, size / 2 + 130 * scale, size, size);
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(0, size / 2 + 112 * scale, size, 18 * scale);
    // City ground.
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, size, size / 2 + 112 * scale);
    // Roads.
    ctx.strokeStyle = '#4a4f57';
    ctx.lineWidth = 9;
    for (const line of this.world.city.roadLines) {
      const [x1, z1] = toMap(line, -125);
      const [x2, z2] = toMap(line, 125);
      ctx.beginPath();
      ctx.moveTo(x1, z1);
      ctx.lineTo(x2, z2);
      ctx.stroke();
      const [x3, z3] = toMap(-125, line);
      const [x4, z4] = toMap(125, line);
      ctx.beginPath();
      ctx.moveTo(x3, z3);
      ctx.lineTo(x4, z4);
      ctx.stroke();
    }
    // Plaza.
    ctx.fillStyle = '#cfc4a8';
    ctx.beginPath();
    const [pcx, pcy] = toMap(0, 0);
    ctx.arc(pcx, pcy, 13, 0, Math.PI * 2);
    ctx.fill();
    // Mission beacon.
    const beacon = this.world.missions.beaconPos();
    if (beacon) {
      const [bx, by] = toMap(beacon.x, beacon.z);
      const pulse = 4 + Math.sin(this.world.elapsed * 5) * 1.5;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(bx, by, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a00';
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cash pickups.
    ctx.fillStyle = '#3ddc5a';
    for (const pickup of this.world.combat.pickups) {
      const [px, py] = toMap(pickup.x, pickup.z);
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    // Traffic (grey) and police (blue/red).
    ctx.fillStyle = '#9aa0a8';
    for (const car of this.world.traffic.cars) {
      const [cx, cy] = toMap(car.x, car.z);
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    for (const car of this.world.police.cruisers) {
      const [cx, cy] = toMap(car.x, car.z);
      ctx.fillStyle = Math.floor(this.world.elapsed * 6) % 2 === 0 ? '#ff3333' : '#3355ff';
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    }
    ctx.fillStyle = '#ff3333';
    for (const enemy of this.world.combat.enemies) {
      const [ex, ey] = toMap(enemy.x, enemy.z);
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    }
    // Player arrow, rotated to the heading.
    const [ux, uy] = toMap(this.world.player.x, this.world.player.z);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(this.world.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
