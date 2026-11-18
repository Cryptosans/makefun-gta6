// pedestrians.js — 26 pedestrians strolling sidewalks; they flee gunfire
// and nearby car theft, and wander back when the scare passes.
import * as THREE from 'three';
import { ROAD_COORDS } from './city.js';
import { clamp, dist2d, rand, pick } from './utils.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xe67e22, 0xfd79a8];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export function makePedMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKIN_COLORS) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRT_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick([0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a1a]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.28), pants);
  legs.position.y = 0.38; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.08; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.13);
  const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(-0.35, 1.05, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(0.35, 1.05, 0); g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export class Pedestrian {
  constructor(scene, id) {
    this.mesh = makePedMesh();
    this.id = id;
    // Start on a sidewalk next to a random road.
    const road = pick(ROAD_COORDS);
    if (Math.random() < 0.5) {
      this.x = road + pick([-6.5, 6.5]);
      this.z = rand(-95, 95);
    } else {
      this.x = rand(-95, 95);
      this.z = road + pick([-6.5, 6.5]);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.heading = rand(0, Math.PI * 2);
    this.speed = rand(0.8, 1.6);
    this.walkPhase = rand(0, 6);
    this.fleeing = false;
    this.fleeTimer = 0;
    this.targetX = this.x;
    this.targetZ = this.z;
    this.pickNewTarget();
    scene.add(this.mesh);
  }
  pickNewTarget() {
    // Walk along a sidewalk: pick a point on a nearby road's sidewalk.
    const road = pick(ROAD_COORDS);
    if (Math.random() < 0.5) {
      this.targetX = road + pick([-6.5, 6.5]);
      this.targetZ = rand(-95, 95);
    } else {
      this.targetX = rand(-95, 95);
      this.targetZ = road + pick([-6.5, 6.5]);
    }
  }
  scare(fromX, fromZ) {
    this.fleeing = true;
    this.fleeTimer = rand(3, 6);
    // Run away from the scare source.
    const dx = this.x - fromX, dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.targetX = clamp(this.x + (dx / len) * 30, -104, 104);
    this.targetZ = clamp(this.z + (dz / len) * 30, -104, 104);
    this.speed = rand(3.2, 4.2);
  }
  update(dt) {
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) { this.fleeing = false; this.speed = rand(0.8, 1.6); this.pickNewTarget(); }
    }
    const dx = this.targetX - this.x, dz = this.targetZ - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) { this.pickNewTarget(); return; }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = clamp(this.x, -104, 104);
    this.z = clamp(this.z, -104, 104);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Walk swing.
    this.walkPhase += dt * (this.fleeing ? 11 : 6);
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
  }
}

export class PedestrianSystem {
  constructor(scene) {
    this.peds = [];
    for (let i = 0; i < 26; i++) this.peds.push(new Pedestrian(scene, i));
  }
  update(dt) { for (const p of this.peds) p.update(dt); }
  // Scare everyone within radius of a point (gunfire, theft).
  scareNear(x, z, radius = 22) {
    let count = 0;
    for (const p of this.peds) {
      if (dist2d(p.x, p.z, x, z) < radius) { p.scare(x, z); count += 1; }
    }
    return count;
  }
}
