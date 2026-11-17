// Solara Bay — HUD and minimap: health, cash, wanted stars, speed, weapon,
// mission objective, toasts, banners, start/pause/wasted screens, and the
// live top-down minimap drawn on a 2D canvas every few frames.
import { fmtMoney } from './utils.js';

const MAP_SIZE = 190;
const WORLD = 520; // world units across the minimap

export class HUD {
  constructor(hooks) {
    this.hooks = hooks; // { onNewGame, onContinue, onResume, onSave, onRestart, onRespawn, onStartMission }
    this.el = {
      hud: document.getElementById('hud'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      wanted: document.getElementById('wanted'),
      speed: document.getElementById('speed'),
      weapon: document.getElementById('weapon'),
      ammo: document.getElementById('ammo'),
      objectiveTitle: document.getElementById('objective-title'),
      objectiveText: document.getElementById('objective-text'),
      timer: document.getElementById('timer'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      minimap: document.getElementById('minimap'),
      startScreen: document.getElementById('start-screen'),
      btnContinue: document.getElementById('btn-continue'),
      pauseScreen: document.getElementById('pause-screen'),
      missionList: document.getElementById('mission-list'),
      wastedScreen: document.getElementById('wasted-screen'),
      wastedTitle: document.getElementById('wasted-title'),
      wastedSub: document.getElementById('wasted-sub'),
      vignette: document.getElementById('vignette'),
      clock: document.getElementById('clock'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._toastTimer = null;
    this._bannerTimer = null;
    this._mapTimer = 0;
    this._lastWanted = -1;
    this._bindButtons();
  }

  _bindButtons() {
    const on = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    };
    on('btn-new', () => this.hooks.onNewGame());
    on('btn-continue', () => this.hooks.onContinue());
    on('btn-howto', () => {
      document.getElementById('howto').classList.toggle('hidden');
    });
    on('btn-resume', () => this.hooks.onResume());
    on('btn-save', () => this.hooks.onSave());
    on('btn-restart', () => this.hooks.onRestart());
    on('btn-quit-title', () => this.hooks.onQuitToTitle());
    on('btn-respawn', () => this.hooks.onRespawn());
  }

  showStart(hasSave) {
    this.el.startScreen.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pauseScreen.classList.add('hidden');
    this.el.wastedScreen.classList.add('hidden');
    this.el.btnContinue.classList.toggle('hidden', !hasSave);
  }

  hideStart() {
    this.el.startScreen.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  showPause(missions) {
    this.el.pauseScreen.classList.remove('hidden');
    const list = this.el.missionList;
    list.innerHTML = '';
    for (const m of missions) {
      const row = document.createElement('div');
      row.className = 'mission-row' + (m.done ? ' done' : '') + (m.active ? ' active' : '');
      const status = m.done ? 'DONE' : m.active ? 'ACTIVE' : fmtMoney(m.reward);
      row.innerHTML = `<span>${m.id}. ${m.title}</span><span>${status}</span>`;
      if (!m.done && !m.active) {
        row.addEventListener('click', () => this.hooks.onStartMission(m.id));
        row.classList.add('clickable');
      }
      list.appendChild(row);
    }
  }

  hidePause() { this.el.pauseScreen.classList.add('hidden'); }

  showWasted(title, sub) {
    this.el.wastedTitle.textContent = title;
    this.el.wastedSub.textContent = sub;
    this.el.wastedScreen.classList.remove('hidden');
  }

  hideWasted() { this.el.wastedScreen.classList.add('hidden'); }

  toast(text, ms = 3600) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  banner(title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.add('hidden'), 4200);
  }

  setObjective(title, text, timerText = '') {
    this.el.objectiveTitle.textContent = title;
    this.el.objectiveText.textContent = text;
    this.el.timer.textContent = timerText;
    this.el.timer.classList.toggle('hidden', !timerText);
  }

  setHint(text) {
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('hidden', !text);
  }

  flashDamage() {
    this.el.vignette.classList.remove('hidden');
    setTimeout(() => this.el.vignette.classList.add('hidden'), 180);
  }

  /** Per-frame HUD numbers. `s` is the live state snapshot from main.js. */
  update(s) {
    const hp = Math.max(0, Math.round(s.health));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.classList.toggle('low', hp <= 30);
    this.el.healthText.textContent = hp;
    this.el.cash.textContent = fmtMoney(s.cash);
    this.el.speed.textContent = s.inCar ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : '';
    this.el.weapon.textContent = s.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    this.el.ammo.textContent = s.weapon === 'pistol' ? `${s.ammo} / ${s.reserve}` : '—';
    if (s.wanted !== this._lastWanted) {
      this._lastWanted = s.wanted;
      this.el.wanted.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const star = document.createElement('span');
        star.className = 'star' + (i < s.wanted ? ' on' : '');
        star.textContent = '★';
        this.el.wanted.appendChild(star);
      }
    }
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    this.el.clock.textContent =
      `DAY 1 — ${String(10 + mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    // Minimap at ~12 fps.
    this._mapTimer += s.dt;
    if (this._mapTimer > 0.08) {
      this._mapTimer = 0;
      this._drawMinimap(s);
    }
  }

  _toMap(x, z) {
    return [(x + WORLD / 2) / WORLD * MAP_SIZE, (z + WORLD / 2) / WORLD * MAP_SIZE];
  }

  _drawMinimap(s) {
    const g = this.mapCtx;
    const W = MAP_SIZE;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#10161d';
    g.fillRect(0, 0, W, W);
    // Bay water along the bottom.
    g.fillStyle = '#1d6f8e';
    g.fillRect(0, W - 14, W, 14);
    // Roads.
    g.strokeStyle = '#3a3f45';
    g.lineWidth = 5;
    for (const line of s.roadLines) {
      const [ax] = this._toMap(line, 0);
      g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax, W); g.stroke();
      const [, az] = this._toMap(0, line);
      g.beginPath(); g.moveTo(0, az); g.lineTo(W, az); g.stroke();
    }
    // Buildings.
    g.fillStyle = '#5a6b7d';
    for (const b of s.buildings) {
      const [x, z] = this._toMap(b.minX, b.minZ);
      const [x2, z2] = this._toMap(b.maxX, b.maxZ);
      g.fillRect(x, z, Math.max(2, x2 - x), Math.max(2, z2 - z));
    }
    const dot = (x, z, color, r = 3) => {
      const [mx, mz] = this._toMap(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx, mz, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const c of s.parkedCars) dot(c.x, c.z, '#9aa0a6', 2);
    for (const c of s.trafficCars) dot(c.x, c.z, '#3b7dd2', 2.5);
    for (const c of s.policeCars) dot(c.x, c.z, '#ff2020', 3.5);
    if (s.missionTarget) {
      const [mx, mz] = this._toMap(s.missionTarget.x, s.missionTarget.z);
      g.fillStyle = '#ffd23a';
      g.save();
      g.translate(mx, mz);
      g.rotate(Math.PI / 4);
      g.fillRect(-4.5, -4.5, 9, 9);
      g.restore();
    }
    // Player arrow.
    const [px, pz] = this._toMap(s.playerX, s.playerZ);
    g.save();
    g.translate(px, pz);
    g.rotate(s.playerHeading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
  }
}
