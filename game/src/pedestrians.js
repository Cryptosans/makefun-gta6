// Solara Bay — pedestrians: sidewalk walkers who flee from crimes and get knocked down.
import * as THREE from 'three';
import { rand, randInt, pick, clamp, dist2D, collideCircle } from './utils.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x50c878, 0xe8b93a, 0x9b59b6, 0xe8e8e8, 0xff7f50, 0x20b2aa];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a1a, 0x4a4a6a];

function makePedMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xe8b98a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirt);
  body.position.y = 1.05; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72; head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pants);
  legL.position.set(-0.16, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), shirt);
  armL.position.set(-0.42, 1.05, 0);
  const armR = armL.clone(); armR.position.x = 0.42;
  g.add(body, head, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, body, head, isPed: true };
  return g;
}

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    for (let i = 0; i < 26; i++) this.spawn(true);
  }

  spawn(anywhere = false) {
    const p = this.city.randomSidewalkPoint();
    const mesh = makePedMesh();
    this.scene.add(mesh);
    const ped = {
      mesh, x: p.x, z: p.z, heading: rand(Math.PI * 2),
      speed: rand(1.2, 2.2), target: this.city.randomSidewalkPoint(),
      state: 'walk', downTimer: 0, fleeTimer: 0, walkPhase: rand(10),
    };
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = ped.heading;
    this.list.push(ped);
    return ped;
  }

  remove(ped) {
    this.scene.remove(ped.mesh);
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
  }

  // A crime nearby: everyone in radius runs away.
  scare(x, z, radius = 22) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      if (dist2D(x, z, ped.x, ped.z) < radius) {
        ped.state = 'flee';
        ped.fleeTimer = rand(3, 6);
        ped.heading = Math.atan2(x - ped.x, z - ped.z) + Math.PI + rand(-0.6, 0.6);
      }
    }
  }

  knockDown(ped) {
    ped.state = 'down';
    ped.downTimer = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
  }

  update(dt, playerCar, onPedHit) {
    for (const ped of this.list) {
      const u = ped.mesh.userData;
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          ped.target = this.city.randomSidewalkPoint();
        }
        continue;
      }
      let speed = ped.speed;
      if (ped.state === 'flee') {
        speed = 5.2;
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.target = this.city.randomSidewalkPoint(); }
      } else {
        const d = dist2D(ped.x, ped.z, ped.target.x, ped.target.z);
        if (d < 2) { ped.target = this.city.randomSidewalkPoint(); continue; }
        const want = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
        let diff = want - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
      }
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      const p = { x: ped.x, z: ped.z };
      collideCircle(p, 0.5, this.city.colliders);
      this.city.clampToWorld(p, 8);
      ped.x = p.x; ped.z = p.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Walk-cycle swing.
      ped.walkPhase += dt * speed * 3.2;
      const sw = Math.sin(ped.walkPhase) * 0.5;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      // Run over by the player's car.
      if (playerCar && Math.abs(playerCar.speed) > 4) {
        if (dist2D(ped.x, ped.z, playerCar.x, playerCar.z) < 2.4) {
          this.knockDown(ped);
          if (onPedHit) onPedHit(ped);
        }
      }
    }
    // Keep the crowd topped up.
    if (this.list.length < 26 && Math.random() < dt * 0.5) this.spawn();
  }
}
