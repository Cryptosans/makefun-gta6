// police.js — the wanted system and its responders.
// Heat rises with crimes and falls when no officer can see the player.
// Police cruisers spawn at the wanted level, chase the player and ram;
// foot cops spawn from wanted 2, punch up close and shoot from wanted 3.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { clamp, rand, pick, dist2D, angleDiff, headingTo } from './utils.js';
import { GRID_LINES } from './city.js';

const HEAT_PER_STAR = [0, 20, 45, 75, 110, 150];

export function wantedFromHeat(heat) {
  let stars = 0;
  for (let i = 1; i <= 5; i++) {
    if (heat >= HEAT_PER_STAR[i]) stars = i;
  }
  return stars;
}

export class Police {
  constructor(scene, city, world) {
    this.scene = scene;
    this.city = city;
    this.world = world;
    this.cruisers = [];
    this.cops = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.heat = 0;
    this.wanted = 0;
    this.lastCrimeAt = -100;
    this.copPunchTimer = 0;
    this.copShotTimer = 0;
  }

  addHeat(amount, x, z) {
    const before = this.wanted;
    this.heat = Math.min(220, this.heat + amount);
    this.lastCrimeAt = this.world.elapsed;
    this.wanted = wantedFromHeat(this.heat);
    if (this.wanted > before) {
      this.world.audio.wantedUp();
      this.world.hud.flashMessage('WANTED LEVEL ' + this.wanted, '#ff5544');
    }
    if (x !== undefined && z !== undefined) {
      this.world.pedestrians.alert(x, z, 26);
    }
  }

  update(dt, playerX, playerZ, playerInCar, playerCar) {
    // Heat decays only while the player is out of sight: no cruiser or
    // cop within 55 units and no crime in the last 8 seconds.
    const anyNear = this._nearestPoliceDist(playerX, playerZ) < 55;
    const recentCrime = this.world.elapsed - this.lastCrimeAt < 8;
    if (!anyNear && !recentCrime && this.heat > 0) {
      this.heat = Math.max(0, this.heat - 3.5 * dt);
      const newWanted = wantedFromHeat(this.heat);
      if (newWanted < this.wanted) {
        this.wanted = newWanted;
        if (newWanted === 0) {
          this.world.hud.flashMessage('You lost the cops', '#7ae08a');
        }
      }
    }
    this._updateCruisers(dt, playerX, playerZ, playerCar, playerInCar);
    this._updateCops(dt, playerX, playerZ, playerInCar);
  }

  _nearestPoliceDist(px, pz) {
    let best = Infinity;
    for (const c of this.cruisers) {
      if (c.isPlayerCar) continue; // a stolen cruiser is not watching you
      best = Math.min(best, dist2D(c.x, c.z, px, pz));
    }
    for (const cop of this.cops) best = Math.min(best, dist2D(cop.x, cop.z, px, pz));
    return best;
  }

  _desiredCruisers() {
    if (this.wanted === 0) return 0;
    return Math.min(5, this.wanted + 1);
  }

  _desiredCops() {
    if (this.wanted < 2) return 0;
    return Math.min(6, this.wanted + 1);
  }

  _spawnCruiserNear(px, pz) {
    // Spawn on a road line, offset from the player so it drives in.
    const line = pick(GRID_LINES);
    const alongNS = Math.random() < 0.5;
    let x, z;
    if (alongNS) {
      x = line;
      z = clamp(pz + (Math.random() < 0.5 ? -1 : 1) * rand(45, 70), -115, 115);
    } else {
      x = clamp(px + (Math.random() < 0.5 ? -1 : 1) * rand(45, 70), -115, 115);
      z = line;
    }
    const car = new Car(this.scene, {
      x, z, heading: 0, police: true, color: 0x1a1a1a,
      maxSpeed: 27, accel: 20,
    });
    car.isPolice = true;
    car.ramCooldown = 0;
    this.cruisers.push(car);
  }

  _updateCruisers(dt, px, pz, playerCar, playerInCar) {
    while (this.cruisers.length < this._desiredCruisers()) {
      this._spawnCruiserNear(px, pz);
    }
    // Extra cruisers despawn once the heat is gone — never the one the
    // player is driving, if they stole a cruiser.
    while (this.cruisers.length > this._desiredCruisers()) {
      const idx = this.cruisers.findIndex((c) => !c.isPlayerCar);
      if (idx === -1) break;
      const car = this.cruisers[idx];
      this.cruisers.splice(idx, 1);
      car.dispose();
    }
    for (const car of this.cruisers) {
      if (car.isPlayerCar) continue; // the player drives this one now
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      // Steer toward the player, with a little wobble so rams are not
      // perfectly robotic.
      const targetHeading = headingTo(car.x, car.z, px, pz) + Math.sin(this.world.elapsed * 1.3 + car.x) * 0.08;
      car.heading += angleDiff(car.heading, targetHeading) * Math.min(1, dt * 2.2);
      const dist = dist2D(car.x, car.z, px, pz);
      // After a ram the cruiser backs off for a moment so the player can
      // actually escape instead of being pinned against a wall.
      let targetSpeed = dist > 10 ? car.maxSpeed : car.maxSpeed * 0.55;
      if (car.ramCooldown > 0) targetSpeed = car.maxSpeed * 0.25;
      if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + car.accel * dt);
      else car.speed = Math.max(targetSpeed, car.speed - 14 * dt);
      car.integrate(dt);
      const fixed = this.city.resolveCollisions(car.x, car.z, 1.6);
      car.x = fixed.x;
      car.z = fixed.z;
      if (this.city.isInWater(car.x, car.z)) {
        car.z = 126;
        car.speed *= 0.4;
      }
      // Ram: contact with the player's car or body hurts and shoves.
      if (dist < 3.4 && car.ramCooldown <= 0) {
        car.ramCooldown = 2.5;
        this.world.onPoliceRam(car, playerInCar, playerCar);
        // Bounce the cruiser back so it does not stick inside the player.
        car.x -= Math.sin(car.heading) * 2.5;
        car.z -= Math.cos(car.heading) * 2.5;
        car.speed *= -0.25;
      }
      // Flash the light bar.
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(this.world.elapsed * 6) % 2 === 0;
        bar.red.material.emissiveIntensity = phase ? 1.6 : 0.15;
        bar.blue.material.emissiveIntensity = phase ? 0.15 : 1.6;
      }
    }
  }

  _spawnCopNear(px, pz) {
    const angle = rand(0, Math.PI * 2);
    const x = clamp(px + Math.cos(angle) * rand(18, 30), -118, 118);
    const z = clamp(pz + Math.sin(angle) * rand(18, 30), -118, 110);
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.9, 0.38),
      new THREE.MeshLambertMaterial({ color: 0x1a2a5a })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a })
    );
    head.position.y = 1.68;
    mesh.add(head);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.14, 10),
      new THREE.MeshLambertMaterial({ color: 0x101828 })
    );
    hat.position.y = 1.92;
    mesh.add(hat);
    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.62, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x1a1a2a })
    );
    legL.position.set(-0.16, 0.31, 0);
    mesh.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    mesh.add(legR);
    mesh.position.set(x, 0, z);
    this.group.add(mesh);
    this.cops.push({
      mesh, legL, legR,
      x, z, heading: 0, speed: 6.8,
      walkPhase: rand(0, 6), punchCooldown: 0, shootCooldown: rand(1, 2),
    });
  }

  _updateCops(dt, px, pz, playerInCar) {
    while (this.cops.length < this._desiredCops()) {
      this._spawnCopNear(px, pz);
    }
    while (this.cops.length > this._desiredCops()) {
      const cop = this.cops.pop();
      this.group.remove(cop.mesh);
    }
    this.copPunchTimer -= dt;
    this.copShotTimer -= dt;
    for (const cop of this.cops) {
      const dist = dist2D(cop.x, cop.z, px, pz);
      const targetHeading = headingTo(cop.x, cop.z, px, pz);
      cop.heading += angleDiff(cop.heading, targetHeading) * Math.min(1, dt * 5);
      let speed = 0;
      if (dist > 2.2) {
        speed = playerInCar ? 7.6 : 6.8;
        cop.x += Math.sin(cop.heading) * speed * dt;
        cop.z += Math.cos(cop.heading) * speed * dt;
      }
      const fixed = this.city.resolveCollisions(cop.x, cop.z, 0.6);
      cop.x = fixed.x;
      cop.z = fixed.z;
      if (this.city.isInWater(cop.x, cop.z)) cop.z = 126;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.walkPhase += dt * speed * 3;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      cop.legL.rotation.x = -swing;
      cop.legR.rotation.x = swing;
      // Punch when close and on foot range; shoot from wanted 3 at range.
      if (dist < 2.4 && this.copPunchTimer <= 0 && !playerInCar) {
        this.copPunchTimer = 0.9;
        this.world.damagePlayer(6, 'punched by a cop');
        this.world.audio.punch();
      }
      if (this.wanted >= 3 && dist < 32 && dist > 3 && this.copShotTimer <= 0) {
        this.copShotTimer = rand(1.4, 2.4);
        cop.shootCooldown = 0;
        this.world.combat.enemyShootAt(cop.x, 1.5, cop.z, px, 1.2, pz, 4);
      }
    }
  }

  clearAll() {
    for (const car of this.cruisers) car.dispose();
    this.cruisers = [];
    for (const cop of this.cops) this.group.remove(cop.mesh);
    this.cops = [];
    this.heat = 0;
    this.wanted = 0;
  }
}
