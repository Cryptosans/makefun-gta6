// missions.js — 6 story missions with beacons, stages, timers and cash.
// Each mission is a small stage list; the engine advances stages on
// proximity / kills / car entry and pays out on completion.
import { dist2d } from './utils.js';

export const MISSION_DEFS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    giver: 'Mara — the fixer at the docks',
    briefing: 'A Comet GT is parked by the plaza. Take it — quietly — and bring it to the garage on the west road. No cops.',
    reward: 500,
    timeLimit: 150,
    stages: [
      { type: 'enterCar', id: 'target', label: 'Steal the Comet GT parked east of the plaza', x: 20, z: 3.5, radius: 4.5 },
      { type: 'driveTo', label: 'Drive the Comet GT to the garage (west road)', x: -80, z: 0, radius: 7 },
    ],
  },
  {
    id: 'courier-run',
    name: 'Courier Run',
    giver: 'Mara',
    briefing: 'Three drops, one night. Hit every checkpoint before the timer dies. Drive fast, drive clean.',
    reward: 800,
    timeLimit: 180,
    stages: [
      { type: 'driveTo', label: 'Drop 1: beachfront (east)', x: 80, z: 80, radius: 8 },
      { type: 'driveTo', label: 'Drop 2: north docks', x: -80, z: -80, radius: 8 },
      { type: 'driveTo', label: 'Drop 3: back to the plaza', x: 0, z: 0, radius: 9 },
    ],
  },
  {
    id: 'ghost-protocol',
    name: 'Ghost Protocol',
    giver: 'Dex — the ghost',
    briefing: 'The Vipers are moving product through the marina. Put down three of them, then slip away to the docks.',
    reward: 1200,
    timeLimit: 240,
    stages: [
      { type: 'kill', label: 'Take out 3 Vipers at the marina', x: 100, z: -40, radius: 18, count: 3, spawn: 'viper', spawnAt: { x: 100, z: -40 } },
      { type: 'goto', label: 'Slip away to the docks (west)', x: -95, z: 0, radius: 8 },
    ],
  },
  {
    id: 'street-justice',
    name: 'Street Justice',
    giver: 'Officer Reyes — off the record',
    briefing: 'The Vipers own the plaza after dark. Clear five of them out. Reyes will look the other way — this once.',
    reward: 1500,
    timeLimit: 240,
    stages: [
      { type: 'kill', label: 'Clear 5 Vipers from the plaza', x: 0, z: 0, radius: 22, count: 5, spawn: 'viper', spawnAt: { x: 0, z: 0 } },
      { type: 'goto', label: 'Meet Reyes at the north road', x: 0, z: -80, radius: 8 },
    ],
  },
  {
    id: 'the-vault',
    name: 'The Vault',
    giver: 'Mara',
    briefing: 'The Solara Bank vault holds the crew\'s cut. Get in, drop the guards, grab the cash and get out to the beach.',
    reward: 2500,
    timeLimit: 300,
    stages: [
      { type: 'goto', label: 'Reach the Solara Bank (north block)', x: -20, z: -60, radius: 8 },
      { type: 'kill', label: 'Drop 4 bank guards', x: -20, z: -60, radius: 20, count: 4, spawn: 'guard', spawnAt: { x: -20, z: -60 } },
      { type: 'goto', label: 'Escape to the beach', x: 100, z: 40, radius: 9 },
    ],
  },
  {
    id: 'king-of-solara',
    name: 'King of Solara',
    giver: 'The whole city is watching',
    briefing: 'Vic "The Shark" Vance runs Solara Bay. End his crew at the marina, then take the plaza. Finish this.',
    reward: 5000,
    timeLimit: 360,
    stages: [
      { type: 'kill', label: 'Take out 6 of Vance\'s crew at the marina', x: 100, z: -40, radius: 20, count: 6, spawn: 'viper', spawnAt: { x: 100, z: -40 } },
      { type: 'kill', label: 'Take out the Shark\'s last 3 enforcers at the plaza', x: 0, z: 0, radius: 22, count: 3, spawn: 'guard', spawnAt: { x: 0, z: 0 } },
      { type: 'goto', label: 'Claim the plaza — King of Solara', x: 0, z: 0, radius: 9 },
    ],
  },
];

export class MissionManager {
  constructor(callbacks) {
    this.cb = callbacks; // {onStart,onStage,onComplete,onFail,onKillNeeded,notify}
    this.index = 0;
    this.status = 'idle'; // idle | active | complete | failed | done (all missions)
    this.stageIndex = 0;
    this.timeLeft = 0;
    this.killsDone = 0;
    this.enemiesSpawned = false;
  }
  get def() { return MISSION_DEFS[this.index] || null; }
  get stage() {
    const d = this.def;
    return d ? d.stages[this.stageIndex] : null;
  }
  get totalMissions() { return MISSION_DEFS.length; }
  start(index) {
    this.index = index;
    this.stageIndex = 0;
    this.killsDone = 0;
    this.enemiesSpawned = false;
    this.timeLeft = this.def.timeLimit;
    this.status = 'active';
    if (this.cb.onStart) this.cb.onStart(this.def);
    this.announceStage();
  }
  announceStage() {
    const s = this.stage;
    if (!s) return;
    if (this.cb.onStage) this.cb.onStage(s, this.stageIndex, this.def.stages.length);
    if (s.type === 'kill' && !this.enemiesSpawned) {
      this.enemiesSpawned = true;
      if (this.cb.onSpawnEnemies) this.cb.onSpawnEnemies(s);
    }
  }
  advance() {
    this.stageIndex += 1;
    this.killsDone = 0;
    this.enemiesSpawned = false;
    if (this.stageIndex >= this.def.stages.length) {
      this.complete();
    } else {
      this.announceStage();
    }
  }
  complete() {
    this.status = 'complete';
    const reward = this.def.reward;
    if (this.cb.onComplete) this.cb.onComplete(this.def, reward);
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.status = 'done';
    } else {
      this.status = 'idle';
    }
  }
  fail(reason) {
    this.status = 'failed';
    if (this.cb.onFail) this.cb.onFail(this.def, reason);
  }
  retry() {
    if (this.def) this.start(this.index);
  }
  registerKill() {
    const s = this.stage;
    if (!s || s.type !== 'kill') return;
    this.killsDone += 1;
    if (this.cb.onKillProgress) this.cb.onKillProgress(this.killsDone, s.count);
    if (this.killsDone >= s.count) this.advance();
  }
  // Called every frame with live game state.
  update(dt, state) {
    if (this.status !== 'active' || !this.def) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.fail('Time ran out'); return; }
    const s = this.stage;
    if (!s) return;
    const px = state.playerX, pz = state.playerZ;
    if (s.type === 'goto' || s.type === 'driveTo') {
      const needCar = s.type === 'driveTo';
      if (needCar && !state.inCar) return; // must be driving for driveTo
      if (dist2d(px, pz, s.x, s.z) < s.radius) this.advance();
    } else if (s.type === 'enterCar') {
      if (state.inCar && state.carId === 'parked-Comet GT') this.advance();
    }
  }
  // Current beacon position for compass / minimap / world marker.
  beacon() {
    const s = this.stage;
    if (this.status !== 'active' || !s) return null;
    return { x: s.x, z: s.z, label: s.label, radius: s.radius || 8 };
  }
  objectiveText() {
    if (this.status === 'done') return 'All missions complete — you are the King of Solara.';
    if (this.status === 'idle') return 'Press M to start: ' + (this.def ? this.def.name : '—');
    if (this.status === 'complete') return 'Mission complete!';
    if (this.status === 'failed') return 'Mission failed — press R to retry.';
    const s = this.stage;
    if (!s) return '';
    let t = s.label;
    if (s.type === 'kill') t += ' (' + this.killsDone + '/' + s.count + ')';
    return t;
  }
}
