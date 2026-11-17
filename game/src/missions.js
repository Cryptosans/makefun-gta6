// Solara Bay — the six-mission story: objectives, timers, rewards, fail/restart.
import { dist2D } from './utils.js';

export const MISSIONS = [
  {
    id: 1, title: 'HOT WHEELS', reward: 500,
    briefing: 'The crew needs wheels. Steal any car and bring it to the Chop Shop.',
    steps: [
      { type: 'steal', label: 'Steal a car (walk up to one and press E)' },
      { type: 'reach', at: 'chopShop', radius: 9, inCar: true, label: 'Drive to the Chop Shop' },
    ],
  },
  {
    id: 2, title: 'COURIER RUN', reward: 800, time: 150,
    briefing: 'Three drops, one very impatient client. No cops, no questions.',
    steps: [
      { type: 'reach', gen: 'road', radius: 8, inCar: false, label: 'Reach drop-off 1' },
      { type: 'reach', gen: 'road', radius: 8, inCar: false, label: 'Reach drop-off 2' },
      { type: 'reach', gen: 'road', radius: 8, inCar: false, label: 'Reach drop-off 3' },
    ],
  },
  {
    id: 3, title: 'GHOST PROTOCOL', reward: 1000,
    briefing: 'The Delacroix crew tipped off the S.B.P.D. Lose the heat — all of it.',
    onStart: 'heat3',
    steps: [
      { type: 'loseCops', label: 'Lose the cops — get your wanted level to zero' },
    ],
  },
  {
    id: 4, title: 'STREET JUSTICE', reward: 1500,
    briefing: 'Delacroix gunmen are holding the warehouse. Take the block back.',
    steps: [
      { type: 'reach', at: 'warehouse', radius: 14, inCar: false, label: 'Reach the Delacroix Warehouse' },
      { type: 'eliminate', count: 4, label: 'Take out the Delacroix crew (0/4)' },
    ],
  },
  {
    id: 5, title: 'THE VAULT', reward: 3000,
    briefing: 'Solara National Bank. Ten seconds on the safe, then vanish.',
    steps: [
      { type: 'reach', at: 'bank', radius: 10, inCar: false, label: 'Reach Solara National Bank' },
      { type: 'hold', at: 'bank', radius: 10, seconds: 10, label: 'Crack the safe — stay at the bank' },
      { type: 'reach', at: 'docks', radius: 11, inCar: false, label: 'Escape to the Solara Docks' },
    ],
  },
  {
    id: 6, title: 'KING OF SOLARA', reward: 5000,
    briefing: 'Five stars. One yacht. If you make the pier, the Bay is yours.',
    onStart: 'heat5',
    steps: [
      { type: 'reach', at: 'pier', radius: 10, inCar: false, label: 'Reach the yacht at Marina Pier' },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;          // current mission index into MISSIONS
    this.completed = [];     // mission ids completed
    this.stepIndex = 0;
    this.stepState = {};
    this.timer = null;       // seconds left, or null
    this.active = false;
    this.storyDone = false;
    this.marker = null;      // {x, z} world position of the current objective
    this.failCooldown = 0;
  }

  get current() { return MISSIONS[this.index] || null; }
  get step() { return this.current ? this.current.steps[this.stepIndex] : null; }

  startStory() {
    this.index = 0;
    this.completed = [];
    this.storyDone = false;
    this.startMission(0);
  }

  startMission(i) {
    const m = MISSIONS[i];
    if (!m) { this.storyDone = true; this.active = false; this.marker = null; return; }
    this.index = i;
    this.stepIndex = 0;
    this.stepState = {};
    this.timer = m.time ?? null;
    this.active = true;
    this.game.hud.setObjective(m.title, m.steps[0].label);
    this.game.hud.banner(`MISSION ${m.id}: ${m.title}`);
    this.game.hud.toast(m.briefing);
    if (m.onStart === 'heat3') this.game.police.setStars(3);
    if (m.onStart === 'heat5') this.game.police.setStars(5);
    this._enterStep();
  }

  _enterStep() {
    const s = this.step;
    this.stepState = { progress: 0 };
    if (!s) return;
    this.game.hud.setObjective(this.current.title, s.label);
    if (s.type === 'reach') {
      if (s.gen === 'road') {
        const p = this.game.city.randomRoadPoint();
        // Keep the drop a decent drive from the player.
        let tries = 0;
        while (dist2D(this.game.player.x, this.game.player.z, p.x, p.z) < 60 && tries++ < 10) {
          const q = this.game.city.randomRoadPoint();
          p.x = q.x; p.z = q.z;
        }
        this.stepState.target = p;
      } else {
        const lm = this.game.city.landmarks[s.at];
        this.stepState.target = { x: lm.x, z: lm.z };
      }
      this.marker = this.stepState.target;
    } else if (s.type === 'eliminate') {
      const lm = this.game.city.landmarks.warehouse;
      this.game.combat.spawnGang(lm.x, lm.z, s.count);
      this.marker = { x: lm.x, z: lm.z };
    } else if (s.type === 'hold') {
      const lm = this.game.city.landmarks[s.at];
      this.stepState.target = { x: lm.x, z: lm.z };
      this.marker = this.stepState.target;
      this.game.police.addHeat(2, 'Alarm tripped');
    } else if (s.type === 'loseCops') {
      this.marker = null;
    } else {
      this.marker = null;
    }
    this.game.markerDirty = true;
  }

  _nextStep() {
    this.game.audio.pickup();
    this.stepIndex++;
    if (this.stepIndex >= this.current.steps.length) this._completeMission();
    else this._enterStep();
  }

  _completeMission() {
    const m = this.current;
    this.completed.push(m.id);
    this.game.addCash(m.reward, `Mission ${m.id} complete`);
    this.game.audio.missionComplete();
    this.game.hud.banner(`MISSION COMPLETE  +$${m.reward}`);
    this.game.saveGame();
    this.active = false;
    this.marker = null;
    if (this.index + 1 >= MISSIONS.length) {
      this.storyDone = true;
      this.game.hud.banner('KING OF SOLARA BAY');
      this.game.hud.toast('Story complete — free roam. The Bay is yours, Rico.');
      this.game.hud.setObjective('FREE ROAM', 'The Bay is yours. Cause chaos, or just cruise.');
    } else {
      setTimeout(() => { if (this.game.state === 'playing') this.startMission(this.index + 1); }, 2500);
    }
  }

  failMission(reason) {
    if (this.failCooldown > 0) return;
    this.failCooldown = 3;
    this.active = false;
    this.marker = null;
    this.game.audio.missionFail();
    this.game.hud.banner('MISSION FAILED');
    this.game.hud.toast(`${reason} — restarting ${this.current.title}.`);
    setTimeout(() => { if (this.game.state === 'playing') this.startMission(this.index); }, 2000);
  }

  update(dt) {
    this.failCooldown = Math.max(0, this.failCooldown - dt);
    if (!this.active || !this.current) return;
    const s = this.step;
    const p = this.game.player;
    if (this.timer !== null) {
      this.timer -= dt;
      this.game.hud.setTimer(this.timer);
      if (this.timer <= 0) {
        this.timer = null;
        this.failMission('Out of time');
        return;
      }
    } else {
      this.game.hud.setTimer(null);
    }
    switch (s.type) {
      case 'steal':
        if (p.inCar) this._nextStep();
        break;
      case 'reach': {
        const t = this.stepState.target;
        const d = dist2D(p.x, p.z, t.x, t.z);
        if (d < s.radius && (!s.inCar || p.inCar)) this._nextStep();
        break;
      }
      case 'loseCops':
        if (this.game.police.stars === 0) this._nextStep();
        break;
      case 'eliminate': {
        const left = this.game.combat.gangAlive();
        const done = s.count - left;
        this.game.hud.setObjective(this.current.title, `Take out the Delacroix crew (${done}/${s.count})`);
        if (left === 0) this._nextStep();
        break;
      }
      case 'hold': {
        const t = this.stepState.target;
        const d = dist2D(p.x, p.z, t.x, t.z);
        if (d < s.radius) {
          this.stepState.progress += dt;
          this.game.hud.setCrack(this.stepState.progress / s.seconds);
          if (this.stepState.progress >= s.seconds) {
            this.game.hud.setCrack(null);
            this._nextStep();
          }
        } else {
          this.stepState.progress = Math.max(0, this.stepState.progress - dt * 0.5);
          this.game.hud.setCrack(this.stepState.progress / s.seconds);
        }
        break;
      }
      default:
        break;
    }
  }

  statusList() {
    return MISSIONS.map((m) => ({
      id: m.id,
      title: m.title,
      state: this.completed.includes(m.id) ? 'done' : (this.current && this.current.id === m.id ? 'current' : 'locked'),
    }));
  }
}
