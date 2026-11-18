// missions.js — the 6 story missions of Solara Bay.
// Each mission is a list of stages (go to a beacon, steal a car, kill a
// set of enemies, collect cash). A glowing beacon column marks the
// target in the world, the HUD shows the objective and the distance, and
// a timer counts down; running out fails the mission and it restarts.

import * as THREE from 'three';
import { dist2D, money } from './utils.js';

export const MISSIONS = [
  {
    name: 'Hot Wheels',
    briefing: 'A Comet GT is parked on Marina Row. Steal it and deliver it to the docks.',
    reward: 500,
    timeLimit: 300,
    stages: [
      { type: 'enterCar', carId: 'comet', x: -53.2, z: 12, radius: 6, text: 'Steal the Comet GT on Marina Row' },
      { type: 'goto', x: 12, z: 100, radius: 9, text: 'Deliver the Comet to the docks drop-off', needCar: 'comet' },
    ],
  },
  {
    name: 'Courier Run',
    briefing: 'Three drops, no questions. Hit every checkpoint before the timer runs out.',
    reward: 800,
    timeLimit: 240,
    stages: [
      { type: 'goto', x: 100, z: 100, radius: 8, text: 'Checkpoint 1 of 3 — South East' },
      { type: 'goto', x: -100, z: -100, radius: 8, text: 'Checkpoint 2 of 3 — North West' },
      { type: 'goto', x: 100, z: -100, radius: 8, text: 'Checkpoint 3 of 3 — North East' },
    ],
  },
  {
    name: 'Ghost Protocol',
    briefing: 'A package waits on the yacht at the end of the pier. Grab it and get back to the plaza.',
    reward: 1200,
    timeLimit: 300,
    stages: [
      { type: 'goto', x: 0, z: 168, radius: 6, text: 'Reach the yacht at the end of the pier' },
      { type: 'goto', x: 0, z: 0, radius: 9, text: 'Return to the plaza with the package' },
    ],
  },
  {
    name: 'Street Justice',
    briefing: 'The Red Bandanas are muscling in on the plaza. Clear all four of them out.',
    reward: 1500,
    timeLimit: 300,
    stages: [
      { type: 'kill', count: 4, x: 0, z: 0, radius: 30, text: 'Take out the Red Bandanas at the plaza (0/4)' },
    ],
  },
  {
    name: 'The Vault',
    briefing: 'The Bay Bank vault is open for one hour. Grab the cash and reach the beach safehouse.',
    reward: 2500,
    timeLimit: 300,
    stages: [
      { type: 'goto', x: -50, z: -50, radius: 8, text: 'Reach the Bay Bank' },
      { type: 'collect', x: -50, z: -50, radius: 8, text: 'Grab the vault cash' },
      { type: 'goto', x: 90, z: 100, radius: 9, text: 'Escape to the beach safehouse' },
    ],
  },
  {
    name: 'King of Solara',
    briefing: 'The crew that runs the north side wants you gone. Finish them and take the crown at the plaza.',
    reward: 5000,
    timeLimit: 420,
    stages: [
      { type: 'kill', count: 6, x: 0, z: 0, radius: 34, text: 'Take out the north-side crew (0/6)' },
      { type: 'goto', x: 0, z: 0, radius: 9, text: 'Claim the plaza — King of Solara' },
    ],
  },
];

export class Missions {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.index = 0;
    this.status = 'idle'; // idle | active | complete | failed
    this.stageIndex = 0;
    this.timeLeft = 0;
    this.killsAtStageStart = 0;
    this.collectedVault = false;
    this.nextStartAt = 0;
    this.beacon = null;
    this.beaconRing = null;
    this._buildBeacon();
  }

  _buildBeacon() {
    // A tall glowing column plus a pulsing ring on the ground.
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd94d, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(3.2, 4.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.1;
    this.beaconRing.visible = false;
    this.scene.add(this.beaconRing);
  }

  current() {
    return MISSIONS[this.index] || null;
  }

  currentStage() {
    const mission = this.current();
    if (!mission) return null;
    return mission.stages[this.stageIndex] || null;
  }

  start(index) {
    this.index = index;
    const mission = this.current();
    if (!mission) {
      this.status = 'idle';
      this._hideBeacon();
      return;
    }
    this.status = 'active';
    this.stageIndex = 0;
    this.timeLeft = mission.timeLimit;
    this.killsAtStageStart = this.world.kills;
    this.collectedVault = false;
    this.world.hud.flashMessage('MISSION: ' + mission.name, '#ffd94d');
    this.world.hud.setObjective(mission.name + ' — ' + mission.stages[0].text);
    this.world.audio.click();
    this._setupStage();
  }

  _setupStage() {
    const stage = this.currentStage();
    if (!stage) return;
    if (stage.type === 'kill') {
      this.killsAtStageStart = this.world.kills;
      const mission = this.current();
      const spots = [
        { x: 14, z: 10 }, { x: -14, z: 8 }, { x: 10, z: -14 },
        { x: -10, z: -12 }, { x: 18, z: -4 }, { x: -18, z: 2 },
      ];
      const count = stage.count;
      for (let i = 0; i < count; i++) {
        const spot = spots[i % spots.length];
        this.world.combat.spawnEnemy(spot.x, spot.z);
      }
      this.world.hud.setObjective(
        mission.name + ' — Take out the crew (' + 0 + '/' + count + ')');
    }
    if (stage.type === 'collect') {
      this.world.combat.spawnPickup(stage.x, stage.z, 400);
      this.collectedVault = false;
    }
    this._placeBeacon();
  }

  _placeBeacon() {
    const stage = this.currentStage();
    if (!stage || stage.type === 'kill') {
      // Kill stages mark the plaza area instead of a single point.
      this.beacon.position.set(0, 30, 0);
      this.beaconRing.position.set(0, 0.1, 0);
      this.beacon.visible = true;
      this.beaconRing.visible = true;
      return;
    }
    this.beacon.position.set(stage.x, 30, stage.z);
    this.beaconRing.position.set(stage.x, 0.1, stage.z);
    this.beacon.visible = true;
    this.beaconRing.visible = true;
  }

  _hideBeacon() {
    this.beacon.visible = false;
    this.beaconRing.visible = false;
  }

  // The world calls this when the player enters a car.
  onEnterCar(car) {
    if (this.status !== 'active') return;
    const stage = this.currentStage();
    if (stage && stage.type === 'enterCar' && car.missionId === stage.carId) {
      this._advanceStage('Comet secured — get it to the docks');
    }
  }

  _advanceStage(message) {
    const mission = this.current();
    this.stageIndex++;
    this.world.audio.pickup();
    if (message) this.world.hud.flashMessage(message, '#7ae08a');
    if (this.stageIndex >= mission.stages.length) {
      this._completeMission();
      return;
    }
    const stage = this.currentStage();
    this.world.hud.setObjective(mission.name + ' — ' + stage.text);
    this._setupStage();
  }

  _completeMission() {
    const mission = this.current();
    this.status = 'complete';
    this.world.state.cash += mission.reward;
    this.world.audio.missionComplete();
    this.world.hud.flashMessage(
      'MISSION COMPLETE — ' + mission.name + '  +' + money(mission.reward), '#7ae08a');
    this.world.hud.setObjective('Mission complete! Next: ' +
      (MISSIONS[this.index + 1] ? MISSIONS[this.index + 1].name : 'You run Solara Bay'));
    this._hideBeacon();
    this.world.onMissionComplete(this.index);
    // Next mission starts a few seconds later so the player can breathe.
    this.nextStartAt = this.world.elapsed + 4;
  }

  _failMission(reason) {
    const mission = this.current();
    this.status = 'failed';
    this.world.audio.missionFail();
    this.world.hud.flashMessage('MISSION FAILED — ' + reason, '#ff5544');
    this.world.hud.setObjective('Mission failed — retrying ' + mission.name + '...');
    this._hideBeacon();
    this.world.combat.clearEnemies();
    this.nextStartAt = this.world.elapsed + 2.5;
  }

  update(dt) {
    // Auto-start the first mission shortly after the game begins, and
    // chain the next mission after a completion or a failure.
    if (this.status === 'idle' && this.world.state.started && !this.world.state.gameOver) {
      if (this.world.elapsed >= this.nextStartAt && this.index < MISSIONS.length) {
        this.start(this.index);
      }
      return;
    }
    if (this.status === 'complete' || this.status === 'failed') {
      if (this.world.elapsed >= this.nextStartAt) {
        if (this.status === 'complete') {
          if (this.index + 1 < MISSIONS.length) this.start(this.index + 1);
          else {
            this.index = MISSIONS.length; // campaign done — stay in free roam
            this.status = 'idle';
            this.world.hud.setObjective('You run Solara Bay. Free roam — steal cars, dodge the law.');
          }
        } else {
          this.start(this.index); // retry the failed mission
        }
      }
      return;
    }
    if (this.status !== 'active') return;
    const mission = this.current();
    const stage = this.currentStage();
    if (!mission || !stage) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this._failMission('time ran out');
      return;
    }
    // Pulse the beacon.
    const pulse = 0.6 + Math.sin(this.world.elapsed * 4) * 0.25;
    this.beacon.material.opacity = 0.28 * pulse + 0.08;
    this.beaconRing.scale.setScalar(1 + Math.sin(this.world.elapsed * 4) * 0.08);

    const px = this.world.player.x;
    const pz = this.world.player.z;
    if (stage.type === 'goto') {
      const dist = dist2D(px, pz, stage.x, stage.z);
      if (stage.needCar) {
        const inTarget = this.world.playerCar &&
          this.world.playerCar.missionId === stage.needCar;
        if (dist < stage.radius && inTarget) {
          this._advanceStage('Drop-off reached');
          return;
        }
      } else if (dist < stage.radius) {
        this._advanceStage(stage.type === 'goto' ? 'Checkpoint reached' : '');
        return;
      }
      this.world.hud.setObjective(
        mission.name + ' — ' + stage.text + '  (' + Math.round(dist) + 'm)');
    } else if (stage.type === 'enterCar') {
      const dist = dist2D(px, pz, stage.x, stage.z);
      this.world.hud.setObjective(
        mission.name + ' — ' + stage.text + '  (' + Math.round(dist) + 'm — press E)');
    } else if (stage.type === 'kill') {
      const kills = this.world.kills - this.killsAtStageStart;
      this.world.hud.setObjective(
        mission.name + ' — Take out the crew (' + kills + '/' + stage.count + ')');
      if (kills >= stage.count) {
        this._advanceStage('Crew cleared');
      }
    } else if (stage.type === 'collect') {
      // The vault cash pickup disappearing means it was collected.
      const stillThere = this.world.combat.pickups.some(
        (p) => Math.abs(p.x - stage.x) < 3 && Math.abs(p.z - stage.z) < 3);
      if (!stillThere && this.world.combat.pickups.length >= 0) {
        // Only advance once the specific vault pickup is gone.
        if (!this.collectedVault) {
          // Check the player actually picked it up: cash rose recently.
          this.collectedVault = true;
          this._advanceStage('Vault cash grabbed — run!');
          return;
        }
      }
      this.world.hud.setObjective(mission.name + ' — ' + stage.text);
    }
  }

  // Where the current beacon is, for the minimap and the compass.
  beaconPos() {
    const stage = this.currentStage();
    if (this.status !== 'active' || !stage) return null;
    if (stage.type === 'kill') return { x: 0, z: 0 };
    return { x: stage.x, z: stage.z };
  }
}
