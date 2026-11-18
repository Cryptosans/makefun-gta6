// player.js — Rico Vega on foot and behind the wheel: movement, camera
// heading, entering/exiting/stealing cars, health, and the player state
// the rest of the game reads.
import * as THREE from 'three';
import { clamp } from './utils.js';
import { resolveBuildingCollision } from './city.js';
import { makePedMesh } from './pedestrians.js';

export class Player {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.mesh = makePedMesh();
    // Rico: red jacket, dark jeans — distinct from peds and cops.
    this.mesh.traverse((o) => {
      if (o.isMesh && o.position.y > 0.9 && o.position.y < 1.5) {
        o.material = new THREE.MeshLambertMaterial({ color: 0xc0392b });
      }
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    cap.position.y = 1.84;
    this.mesh.add(cap);
    scene.add(this.mesh);
    this.x = 0; this.z = 8;
    this.heading = Math.PI; // facing north (-z is heading PI in our convention)
    this.camYaw = Math.PI;
    this.health = 100;
    this.maxHealth = 100;
    this.cash = 0;
    this.inCar = false;
    this.car = null;
    this.walkPhase = 0;
    this.runSpeed = 7.5;
    this.walkSpeed = 4.2;
    this.dead = false;
    this.deadTimer = 0;
    this.mesh.position.set(this.x, 0, this.z);
  }
  get pos() { return { x: this.x, z: this.z }; }
  spawn(x, z, heading) {
    this.x = x; this.z = z;
    if (heading !== undefined) { this.heading = heading; this.camYaw = heading; }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    this.health = this.maxHealth;
    this.dead = false;
  }
  enterCar(car) {
    this.car = car;
    this.inCar = true;
    car.isPlayer = true;
    car.stolen = true;
    this.mesh.visible = false;
    this.heading = car.heading;
    this.camYaw = car.heading;
  }
  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.isPlayer = false;
    // Step out to the driver's side.
    const sideX = car.x + Math.cos(car.heading) * 2.2;
    const sideZ = car.z - Math.sin(car.heading) * 2.2;
    this.x = clamp(sideX, -106, 106);
    this.z = clamp(sideZ, -106, 106);
    this.heading = car.heading;
    this.camYaw = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.car = null;
    this.inCar = false;
  }
  damage(amount) {
    if (this.dead) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    if (this.health <= 0) {
      this.dead = true;
      this.deadTimer = 3;
    }
  }
  heal(amount) { this.health = clamp(this.health + amount, 0, this.maxHealth); }
  // On-foot step. moveF/moveR in -1..1, dt seconds.
  walk(moveF, moveR, running, dt) {
    if (this.dead || this.inCar) return;
    const speed = running ? this.runSpeed : this.walkSpeed;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * moveF + rx * moveR;
    let mz = fz * moveF + rz * moveR;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      const want = Math.atan2(mx, mz);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += clamp(diff, -8 * dt, 8 * dt);
      this.walkPhase += dt * (running ? 11 : 7);
      const swing = Math.sin(this.walkPhase) * 0.6;
      if (this.mesh.userData.armL) this.mesh.userData.armL.rotation.x = swing;
      if (this.mesh.userData.armR) this.mesh.userData.armR.rotation.x = -swing;
    } else {
      if (this.mesh.userData.armL) this.mesh.userData.armL.rotation.x *= 0.8;
      if (this.mesh.userData.armR) this.mesh.userData.armR.rotation.x *= 0.8;
    }
    const p = resolveBuildingCollision(this.colliders, { x: this.x, z: this.z }, 0.7);
    this.x = clamp(p.x, -106, 110);
    this.z = clamp(p.z, -106, 106);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
  // Camera anchor: above and behind the player (or the car).
  cameraAnchor() {
    if (this.inCar && this.car) {
      return { x: this.car.x, z: this.car.z, heading: this.car.heading, speed: Math.abs(this.car.speed) };
    }
    return { x: this.x, z: this.z, heading: this.camYaw, speed: 0 };
  }
}
