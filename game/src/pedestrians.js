// Solara Bay — pedestrians: 26 locals strolling the sidewalks. They wander
// from intersection to intersection, scatter when a fight breaks out near
// them, and occasionally cross the road. Hitting one is a crime.
import * as THREE from 'three';
import { CONFIG, ROAD_LINES } from './config.js';
import { rand, pick, dist2D, clamp } from './utils.js';

const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b88a, 0x6b4423, 0xd9a066];
const SHIRTS = [0x3b7dd2, 0x37b268, 0xe8c33a, 0xd23b3b, 0x8a5a9d, 0xdddddd, 0x2e8b8b];
const PANTS = [0x2e4a7d, 0x333333, 0x5a3a2a, 0x4a5d4f];

function buildPedMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), shirt);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.95;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), pants);
  legL.position.set(-0.2, 0.4, 0);
  legL.name = 'legL';
  const legR = legL.clone();
  legR.position.x = 0.2;
  legR.name = 'legR';
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), skin);
  armL.position.set(-0.55, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.55;
  g.add(torso, head, legL, legR, armL, armR);
  return g;
}

export class Pedestrians {
  constructor(scene) {
    this.peds = [];
    for (let i = 0; i < CONFIG.pedestrians.count; i++) {
      const mesh = buildPedMesh();
      const start = this._sidewalkSpot();
      mesh.position.set(start.x, 0, start.z);
      scene.add(mesh);
      this.peds.push({
        mesh,
        pos: mesh.position,
        heading: rand(0, Math.PI * 2),
        target: this._sidewalkSpot(),
        speed: CONFIG.pedestrians.walkSpeed * rand(0.8, 1.3),
        phase: rand(0, 6),
        fleeing: false,
        fleeTimer: 0,
        panic: 0,
        down: false,
        downTimer: 0,
      });
    }
  }

  /** A point on a sidewalk: just off a road centreline. */
  _sidewalkSpot() {
    const line = pick(ROAD_LINES);
    const along = rand(-190, 190);
    const off = pick([-9.5, 9.5]);
    return Math.random() < 0.5
      ? { x: along, z: line + off }
      : { x: line + off, z: along };
  }

  /** Everyone within radius of (x, z) runs away for a few seconds. */
  scare(x, z, radius = CONFIG.pedestrians.fleeRadius) {
    for (const p of this.peds) {
      if (dist2D(p.pos.x, p.pos.z, x, z) < radius) {
        p.fleeing = true;
        p.fleeTimer = 3 + Math.random() * 2;
        p.panic = 1;
      }
    }
  }

  update(dt, playerPos, playerSpeed) {
    for (const p of this.peds) {
      // Knocked-down peds stay down, then get up somewhere else.
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          const spot = this._sidewalkSpot();
          p.pos.set(spot.x, 0, spot.z);
          p.down = false;
          p.mesh.visible = true;
          p.target = this._sidewalkSpot();
        }
        continue;
      }
      if (p.fleeTimer > 0) p.fleeTimer -= dt;
      else p.fleeing = false;
      // A speeding car right behind a ped also scares them.
      if (!p.fleeing && playerSpeed > 18 &&
        dist2D(p.pos.x, p.pos.z, playerPos.x, playerPos.z) < 7) {
        p.fleeing = true;
        p.fleeTimer = 2;
      }
      let tx, tz, speed;
      if (p.fleeing) {
        // Run directly away from the player.
        const dx = p.pos.x - playerPos.x;
        const dz = p.pos.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = p.pos.x + (dx / d) * 20;
        tz = p.pos.z + (dz / d) * 20;
        speed = CONFIG.pedestrians.fleeSpeed;
      } else {
        tx = p.target.x;
        tz = p.target.z;
        speed = p.speed;
        if (dist2D(p.pos.x, p.pos.z, tx, tz) < 2) p.target = this._sidewalkSpot();
      }
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const want = Math.atan2(dx, dz);
        let diff = want - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += diff * Math.min(1, dt * 5);
        p.mesh.rotation.y = p.heading;
        p.pos.x += Math.sin(p.heading) * speed * dt;
        p.pos.z += Math.cos(p.heading) * speed * dt;
        p.pos.x = clamp(p.pos.x, -252, 252);
        p.pos.z = clamp(p.pos.z, -252, 212);
        p.phase += dt * speed * 2.4;
        const swing = Math.sin(p.phase) * 0.5;
        const legL = p.mesh.getObjectByName('legL');
        const legR = p.mesh.getObjectByName('legR');
        if (legL) legL.rotation.x = swing;
        if (legR) legR.rotation.x = -swing;
      }
    }
  }
}
