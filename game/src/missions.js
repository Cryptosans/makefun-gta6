// Solara Bay — the story: six missions for Rio Vela, from stealing his
// first car to the big score at the Solara National Bank. Each mission is a
// small state machine: start point, objective checks per frame, reward.
// Missions are started by pressing E at their glowing marker, or from the
// pause menu's mission list.
import * as THREE from 'three';
import { PLACES } from './config.js';
import { dist2D, fmtMoney } from './utils.js';

export const MISSION_DEFS = [
  {
    id: 1, title: 'First Wheels', reward: 500,
    briefing: 'Mara needs wheels for the crew. Steal any car and bring it to the Marina marker.',
    start: { x: -36, z: 108 },
    objective: 'Steal a car (E), then drive to the Marina marker.',
    type: 'driveTo', target: PLACES.marina, radius: 9, needCar: true,
  },
  {
    id: 2, title: 'Bay Runner', reward: 800,
    briefing: 'Two packages, two drops, one clock. Deliver to the Docks, then the Pier, before time runs out.',
    start: { x: 36, z: 108 },
    objective: 'Deliver to the Docks, then the Pier. 180 seconds.',
    type: 'stops', targets: [PLACES.docks, PLACES.pier], radius: 9, timeLimit: 180,
  },
  {
    id: 3, title: 'Hot Pursuit', reward: 1000,
    briefing: 'The PD is on you. Reach the Hideout, then stay out of their hands until the heat dies.',
    start: { x: 108, z: 108 },
    objective: 'Reach the Hideout, then survive until wanted hits 0.',
    type: 'escape', target: PLACES.hideout, radius: 10, startWanted: 2, calmNeed: 1,
  },
  {
    id: 4, title: 'Dockside Brawl', reward: 1200,
    briefing: 'The Vipers hold the docks. Put all three of them down — fists or pistol, your call.',
    start: { x: -144, z: 108 },
    objective: 'Defeat the 3 Vipers at the Docks.',
    type: 'defeat', target: PLACES.docks, radius: 26, thugs: 3,
  },
  {
    id: 5, title: 'The Pickup', reward: 900,
    briefing: 'Three packages stashed around the Market plaza. Collect them all on foot.',
    start: { x: -36, z: 72 },
    objective: 'Collect 3 packages at the Market plaza (on foot).',
    type: 'collect', target: PLACES.market, radius: 30, pickups: 3,
  },
  {
    id: 6, title: 'The Big Score', reward: 5000,
    briefing: 'Solara National Bank. Grab the cash, then lose a three-star tail and vanish at the Hideout.',
    start: { x: 0, z: -72 },
    objective: 'Grab the cash at the Bank, then escape to the Hideout.',
    type: 'heist', target: PLACES.bank, radius: 9, escape: PLACES.hideout, escapeRadius: 10,
  },
];

export class Missions {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { onStart, onComplete, onFail, onObjective, spawnThugs, clearThugs, spawnPickups, clearPickups }
    this.completed = new Set();
    this.active = null; // { def, stage, timer, ... }
    this.beacon = this._makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.markerGroup = new THREE.Group();
    scene.add(this.markerGroup);
    this._buildStartMarkers();
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23a, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.y = 21;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.35, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(beam, ring);
    return g;
  }

  _buildStartMarkers() {
    for (const def of MISSION_DEFS) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16),
        new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.75 }),
      );
      m.position.set(def.start.x, 0.3, def.start.z);
      m.userData.missionId = def.id;
      this.markerGroup.add(m);
    }
  }

  /** The next uncompleted mission, in story order. */
  nextAvailable() {
    return MISSION_DEFS.find((d) => !this.completed.has(d.id)) || null;
  }

  /** Start marker the player stands on, if any mission is available there. */
  startAt(x, z) {
    if (this.active) return null;
    for (const def of MISSION_DEFS) {
      if (this.completed.has(def.id)) continue;
      if (dist2D(x, z, def.start.x, def.start.z) < 4) return this.start(def.id);
    }
    return null;
  }

  start(id) {
    const def = MISSION_DEFS.find((d) => d.id === id);
    if (!def || this.completed.has(id) || this.active) return null;
    this.active = {
      def,
      stage: 0,
      timer: def.timeLimit || 0,
      grabbed: false,
      reachedHideout: false,
      calm: 0,
    };
    if (def.type === 'escape' && def.startWanted) this.hooks.setWanted(def.startWanted);
    if (def.type === 'defeat') this.hooks.spawnThugs(def.target, def.thugs);
    if (def.type === 'collect') this.hooks.spawnPickups(def.target, def.pickups);
    this.hooks.onStart(def);
    this._updateBeacon();
    return def;
  }

  abort() {
    if (!this.active) return;
    this.hooks.clearThugs();
    this.hooks.clearPickups();
    this.active = null;
    this.beacon.visible = false;
  }

  /** Current objective target for the HUD beacon and minimap. */
  currentTarget() {
    if (!this.active) return null;
    const { def, stage } = this.active;
    if (def.type === 'stops') return def.targets[Math.min(stage, def.targets.length - 1)];
    if (def.type === 'heist') return this.active.grabbed ? def.escape : def.target;
    if (def.type === 'escape') return def.target;
    return def.target;
  }

  _updateBeacon() {
    const t = this.currentTarget();
    if (!t) { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    this.beacon.position.set(t.x, 0, t.z);
  }

  /** Per-frame progress checks. Returns 'complete' | 'fail' | null. */
  update(dt, ctx) {
    if (!this.active) return null;
    const a = this.active;
    const def = a.def;
    // Spin the beacon ring.
    this.beacon.rotation.y += dt * 1.2;
    if (a.timer > 0) {
      a.timer -= dt;
      if (a.timer <= 0) {
        this.hooks.onFail(def, 'Time ran out.');
        this.abort();
        return 'fail';
      }
    }
    const px = ctx.playerX;
    const pz = ctx.playerZ;
    const inCar = ctx.inCar;
    if (def.type === 'driveTo') {
      if (inCar && dist2D(px, pz, def.target.x, def.target.z) < def.radius) {
        return this._complete();
      }
    } else if (def.type === 'stops') {
      const t = def.targets[a.stage];
      if (dist2D(px, pz, t.x, t.z) < def.radius) {
        a.stage++;
        this.hooks.onObjective(a.stage >= def.targets.length
          ? 'Final drop reached — head home.'
          : `Drop ${a.stage + 1} of ${def.targets.length}: next stop marked.`);
        this.hooks.blip();
        if (a.stage >= def.targets.length) return this._complete();
        this._updateBeacon();
      }
    } else if (def.type === 'escape') {
      if (!a.reachedHideout && dist2D(px, pz, def.target.x, def.target.z) < def.radius) {
        a.reachedHideout = true;
        this.hooks.onObjective('You made the Hideout. Stay hidden until the heat dies down.');
      }
      if (a.reachedHideout) {
        if (ctx.wanted === 0) {
          a.calm += dt;
          if (a.calm >= a.calmNeed) return this._complete();
        } else {
          a.calm = 0;
        }
      }
    } else if (def.type === 'defeat') {
      if (ctx.thugsLeft <= 0) return this._complete();
    } else if (def.type === 'collect') {
      if (!inCar && ctx.pickupsLeft <= 0) return this._complete();
    } else if (def.type === 'heist') {
      if (!a.grabbed && dist2D(px, pz, def.target.x, def.target.z) < def.radius) {
        a.grabTimer = (a.grabTimer || 0) + dt;
        if (a.grabTimer >= 3) {
          a.grabbed = true;
          this.hooks.setWanted(3);
          this.hooks.onObjective('Cash grabbed! Three stars — lose them and reach the Hideout.');
          this.hooks.cash();
          this._updateBeacon();
        }
      } else {
        a.grabTimer = 0;
      }
      if (a.grabbed && dist2D(px, pz, def.escape.x, def.escape.z) < def.escapeRadius) {
        return this._complete();
      }
    }
    return null;
  }

  _complete() {
    const def = this.active.def;
    this.completed.add(def.id);
    this.hooks.clearThugs();
    this.hooks.clearPickups();
    this.hooks.onComplete(def);
    this.active = null;
    this.beacon.visible = false;
    return 'complete';
  }

  get isStoryDone() {
    return this.completed.size >= MISSION_DEFS.length;
  }
}
