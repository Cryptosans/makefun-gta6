// pedestrians.js — 26 pedestrians strolling the sidewalks.
// Each one walks a road line on the sidewalk, turns at intersections,
// and sprints away from gunfire or a nearby car theft. They are simple
// box figures with swinging arms so the streets feel alive.

import * as THREE from 'three';
import { rand, randInt, pick, dist2D, angleDiff } from './utils.js';
import { GRID_LINES } from './city.js';

const SHIRTS = [
  0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c94a, 0x9a4ad8,
  0xd87a4a, 0x4ad8d2, 0xe0e0e0, 0x333333, 0x7ad84a,
];
const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a34, 0xf0c8a0, 0x6a4128];

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let i = 0; i < 26; i++) {
      this.peds.push(this._makePed());
    }
  }

  _makePed() {
    const shirt = pick(SHIRTS);
    const skin = pick(SKINS);
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.85, 0.36),
      new THREE.MeshLambertMaterial({ color: shirt })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshLambertMaterial({ color: skin })
    );
    head.position.y = 1.68;
    head.castShadow = true;
    mesh.add(head);
    const legMat = new THREE.MeshLambertMaterial({ color: pick([0x2a2a3a, 0x4a3a2a, 0x5a5a5a]) });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), legMat);
    legL.position.set(-0.16, 0.31, 0);
    mesh.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    mesh.add(legR);
    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.7, 0.18),
      new THREE.MeshLambertMaterial({ color: skin })
    );
    armL.position.set(-0.4, 1.05, 0);
    mesh.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.4;
    mesh.add(armR);
    this.group.add(mesh);

    const alongNS = Math.random() < 0.5;
    const line = pick(GRID_LINES);
    const side = Math.random() < 0.5 ? 1 : -1;
    const along = rand(-115, 115);
    const ped = {
      mesh, armL, armR, legL, legR,
      x: alongNS ? line + side * 9.5 : along,
      z: alongNS ? along : line + side * 9.5,
      axis: alongNS ? 'ns' : 'ew',
      line,
      side,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: rand(1.2, 2.2),
      walkPhase: rand(0, Math.PI * 2),
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      heading: 0,
    };
    ped.heading = ped.axis === 'ns' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    mesh.position.set(ped.x, 0, ped.z);
    mesh.rotation.y = ped.heading;
    return ped;
  }

  // Called by the world when a crime happens nearby.
  alert(x, z, radius) {
    for (const ped of this.peds) {
      if (dist2D(ped.x, ped.z, x, z) < radius) {
        ped.fleeTimer = rand(2.5, 4);
        ped.fleeX = x;
        ped.fleeZ = z;
      }
    }
  }

  update(dt) {
    for (const ped of this.peds) {
      let speed = ped.speed;
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        speed = 7.5;
        // Run directly away from the scare point.
        const away = Math.atan2(ped.x - ped.fleeX, ped.z - ped.fleeZ);
        ped.heading += angleDiff(ped.heading, away) * Math.min(1, dt * 6);
      } else {
        // Stroll along the sidewalk; turn at intersections sometimes.
        const alongPos = ped.axis === 'ns' ? ped.z : ped.x;
        const nearestLine = this.city.nearestRoadLine(alongPos);
        if (Math.abs(alongPos - nearestLine) < 1.5 && Math.random() < dt * 0.5) {
          ped.axis = ped.axis === 'ns' ? 'ew' : 'ns';
          ped.line = nearestLine;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
          if (ped.axis === 'ns') ped.x = ped.line + ped.side * 9.5;
          else ped.z = ped.line + ped.side * 9.5;
        }
        const targetHeading = ped.axis === 'ns'
          ? (ped.dir > 0 ? 0 : Math.PI)
          : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        ped.heading += angleDiff(ped.heading, targetHeading) * Math.min(1, dt * 4);
      }
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      // Keep them inside the city and off the water.
      if (Math.abs(ped.x) > 122) ped.x = Math.sign(ped.x) * 122;
      if (ped.z > 118) ped.z = 118;
      if (ped.z < -122) ped.z = -122;
      // Collision with buildings: simple push-out.
      const fixed = this.city.resolveCollisions(ped.x, ped.z, 0.6);
      ped.x = fixed.x;
      ped.z = fixed.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Walk cycle: arms and legs swing opposite.
      ped.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(ped.walkPhase) * 0.55;
      ped.armL.rotation.x = swing;
      ped.armR.rotation.x = -swing;
      ped.legL.rotation.x = -swing;
      ped.legR.rotation.x = swing;
    }
  }

  all() {
    return this.peds;
  }
}
