// player.js — Rico Vega on foot and behind the wheel.
// On foot: WASD moves relative to the camera, Shift runs, E enters the
// nearest car. In a car: WASD drives, Space is the handbrake, E gets out.
// Stealing a car that is not parked counts as a crime and raises heat.

import * as THREE from 'three';
import { clamp, dist2D, angleDiff, angleLerp } from './utils.js';

export class Player {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mesh = this._buildMesh();
    scene.add(this.mesh);
    this.x = 0;
    this.z = 100;
    this.heading = Math.PI; // facing north, into the city
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.speed = 0;
    this.walkPhase = 0;
    this.inCar = false;
    this.currentCar = null;
    this.crashDamageCooldown = 0;
    this.armL = this.mesh.userData.armL;
    this.armR = this.mesh.userData.armR;
    this.legL = this.mesh.userData.legL;
    this.legR = this.mesh.userData.legR;
  }

  _buildMesh() {
    const group = new THREE.Group();
    // Rico: teal shirt, dark jeans, dark hair.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.9, 0.38),
      new THREE.MeshLambertMaterial({ color: 0x1a8a7a })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a })
    );
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.16, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    hair.position.y = 1.96;
    group.add(hair);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), legMat);
    legL.position.set(-0.17, 0.31, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.17;
    group.add(legR);
    const armMat = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), armMat);
    armL.position.set(-0.42, 1.05, 0);
    group.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.42;
    group.add(armR);
    // The pistol, visible in the right hand while on foot.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    gun.position.set(0.42, 0.72, 0.18);
    group.add(gun);
    group.userData = { armL, armR, legL, legR };
    return group;
  }

  setPosition(x, z, heading) {
    this.x = x;
    this.z = z;
    if (heading !== undefined) {
      this.heading = heading;
      this.cameraYaw = heading;
    }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  // Nearest car the player could enter, within reach.
  nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    const candidates = [
      ...this.world.parkedCars,
      ...this.world.traffic.cars,
      ...this.world.police.cruisers,
    ];
    if (this.world.missionCar) candidates.push(this.world.missionCar);
    for (const car of candidates) {
      if (car.dead) continue;
      const d = dist2D(this.x, this.z, car.x, car.z);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best;
  }

  enterCar(car) {
    this.inCar = true;
    this.currentCar = car;
    car.isPlayerCar = true;
    car.parked = false;
    car.stop();
    this.mesh.visible = false;
    this.world.audio.door();
    this.world.missions.onEnterCar(car);
    if (car.missionId !== 'comet' && !car.wasStolenBefore) {
      // Stealing any car that is not the mission target is a crime.
      // Parked cars count too: they belong to somebody.
      this.world.police.addHeat(30, car.x, car.z);
      this.world.hud.flashMessage('Car stolen — the law is coming', '#ff5544');
      car.wasStolenBefore = true;
    }
    car.stolen = true;
  }

  exitCar() {
    if (!this.currentCar) return;
    const car = this.currentCar;
    car.isPlayerCar = false;
    // Step out on the driver's side.
    const sideX = car.x + Math.cos(car.heading) * 2.2;
    const sideZ = car.z - Math.sin(car.heading) * 2.2;
    this.inCar = false;
    this.currentCar = null;
    const fixed = this.world.city.resolveCollisions(sideX, sideZ, 0.7);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = car.heading;
    this.cameraYaw = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.world.audio.door();
  }

  update(dt, input) {
    const mouse = input.consumeMouse();
    // Mouse look: yaw follows the pointer, pitch is clamped.
    this.cameraYaw -= mouse.dx * 0.0032;
    this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.0022, -0.1, 0.9);
    if (input.pressed('KeyE')) {
      if (this.inCar) {
        this.exitCar();
      } else {
        const car = this.nearestCar(4.5);
        if (car) this.enterCar(car);
      }
    }

    if (this.inCar && this.currentCar) {
      this._updateDriving(dt, input);
    } else {
      this._updateOnFoot(dt, input);
    }

    // Interaction prompt.
    if (!this.inCar) {
      const car = this.nearestCar(4.5);
      if (car) {
        const label = car.missionId === 'comet' ? 'Steal the Comet GT' : 'Enter car';
        this.world.hud.showInteract('[E] ' + label);
      } else {
        this.world.hud.hideInteract();
      }
    } else {
      this.world.hud.showInteract('[E] Exit car  ·  [Space] Handbrake');
    }
  }

  _updateOnFoot(dt, input) {
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const topSpeed = run ? 10 : 5.5;
    let forward = 0;
    let strafe = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) forward += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) forward -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) strafe -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) strafe += 1;
    const moving = forward !== 0 || strafe !== 0;
    const targetSpeed = moving ? topSpeed : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (moving) {
      // Movement is relative to where the camera looks.
      const sin = Math.sin(this.cameraYaw);
      const cos = Math.cos(this.cameraYaw);
      const len = Math.sqrt(forward * forward + strafe * strafe);
      const fx = (forward * sin - strafe * cos) / len;
      const fz = (forward * cos + strafe * sin) / len;
      this.x += fx * this.speed * dt;
      this.z += fz * this.speed * dt;
      const targetHeading = Math.atan2(fx, fz);
      this.heading = angleLerp(this.heading, targetHeading, dt * 10);
    }
    // Stay out of buildings and out of the water (except on the pier).
    const fixed = this.world.city.resolveCollisions(this.x, this.z, 0.7);
    this.x = fixed.x;
    this.z = fixed.z;
    if (this.world.city.isInWater(this.x, this.z)) {
      this.z = 126;
    }
    this.x = clamp(this.x, -124, 124);
    this.z = clamp(this.z, -124, 172);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Walk cycle.
    this.walkPhase += dt * this.speed * 2.4;
    const swing = Math.sin(this.walkPhase) * (this.speed > 0.5 ? 0.6 : 0);
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;
  }

  _updateDriving(dt, input) {
    const car = this.currentCar;
    let throttle = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) throttle += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) throttle -= 1;
    let steer = 0;
    if (input.down('KeyA') || input.down('ArrowLeft')) steer += 1;
    if (input.down('KeyD') || input.down('ArrowRight')) steer -= 1;
    const handbrake = input.down('Space');
    const prevSpeed = car.speed;
    car.drive(dt, throttle, steer, handbrake);
    this.crashDamageCooldown = Math.max(0, this.crashDamageCooldown - dt);
    // Building collision: stop and slide out.
    const before = { x: car.x, z: car.z };
    const fixed = this.world.city.resolveCollisions(car.x, car.z, 1.7);
    if (fixed.x !== before.x || fixed.z !== before.z) {
      car.x = fixed.x;
      car.z = fixed.z;
      // Crash damage has a cooldown so grinding along a wall does not
      // machine-gun the player's health away.
      if (Math.abs(prevSpeed) > 8 && this.crashDamageCooldown <= 0) {
        this.crashDamageCooldown = 1.0;
        this.world.audio.crash();
        this.world.damagePlayer(2, 'crash');
      }
      car.speed *= 0.35;
    }
    // Water stops cars at the shoreline.
    if (this.world.city.isInWater(car.x, car.z)) {
      car.z = 126;
      car.speed *= 0.3;
    }
    car.x = clamp(car.x, -124, 124);
    car.z = clamp(car.z, -124, 127);
    this.x = car.x;
    this.z = car.z;
    this.heading = car.heading;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Ramming a traffic car shoves it and counts as a minor crime.
    for (const other of this.world.traffic.cars) {
      if (other.dead) continue;
      const d = dist2D(car.x, car.z, other.x, other.z);
      if (d < 3.2 && Math.abs(car.speed) > 6) {
        const push = Math.atan2(other.x - car.x, other.z - car.z);
        other.x += Math.sin(push) * 2.5;
        other.z += Math.cos(push) * 2.5;
        other.speed *= 0.4;
        car.speed *= 0.7;
        this.world.audio.crash();
        this.world.police.addHeat(6, car.x, car.z);
      }
    }
  }
}
