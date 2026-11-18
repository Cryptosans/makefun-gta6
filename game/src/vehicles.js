// vehicles.js — procedural cars and arcade driving physics.
// Every car is built from boxes, cylinders and a canvas plate texture:
// no model files, no external assets. One Car class serves the player,
// traffic and police; only the paint, flags and driver differ.

import * as THREE from 'three';
import { clamp, rand, pick } from './utils.js';

export const CAR_COLORS = [
  0xc0392b, 0x2e6fd8, 0x27ae60, 0xf1c40f, 0x8e44ad,
  0xe67e22, 0x1abc9c, 0xecf0f1, 0x2c3e50, 0xd35400,
  0x7f8c8d, 0xc0c0c0, 0x16a085, 0x922b21,
];

const BODY_MATERIALS = new Map();
function bodyMaterial(color) {
  if (!BODY_MATERIALS.has(color)) {
    BODY_MATERIALS.set(
      color,
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.08 })
    );
  }
  return BODY_MATERIALS.get(color);
}

const DARK_GLASS = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
const TIRE_MAT = new THREE.MeshLambertMaterial({ color: 0x141414 });
const RIM_MAT = new THREE.MeshLambertMaterial({ color: 0xb8b8b8 });
const LIGHT_MAT = new THREE.MeshLambertMaterial({
  color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.9,
});
const TAIL_MAT = new THREE.MeshLambertMaterial({
  color: 0xaa0000, emissive: 0xdd1111, emissiveIntensity: 0.7,
});

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = bodyMaterial(color);
  const isPolice = !!opts.police;
  const isSport = !!opts.sport;

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, isSport ? 4.4 : 4.1), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.58, isSport ? 2.0 : 2.1),
    isPolice ? bodyMat : DARK_GLASS
  );
  cabin.position.set(0, 1.12, isSport ? -0.25 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const positions = [
    [-1.0, 0.36, 1.35], [1.0, 0.36, 1.35],
    [-1.0, 0.36, -1.35], [1.0, 0.36, -1.35],
  ];
  const wheels = [];
  for (const [wx, wy, wz] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights and tail lights.
  for (const side of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), LIGHT_MAT);
    head.position.set(side, 0.6, isSport ? 2.22 : 2.07);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), TAIL_MAT);
    tail.position.set(side, 0.62, isSport ? -2.22 : -2.07);
    group.add(tail);
  }

  if (isPolice) {
    // White doors + black hood read as a cruiser at a glance.
    const doorL = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.5, 1.9),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
    );
    doorL.position.set(-1.02, 0.6, 0);
    group.add(doorL);
    const doorR = doorL.clone();
    doorR.position.x = 1.02;
    group.add(doorR);
    // Light bar.
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.14, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    barBase.position.set(0, 1.5, -0.15);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.2, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xdd1111, emissive: 0xff2222, emissiveIntensity: 1.2 })
    );
    red.position.set(-0.3, 1.55, -0.15);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.2, 0.36),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.2 })
    );
    blue.position.set(0.3, 1.55, -0.15);
    group.add(blue);
    group.userData.lightBar = { red, blue };
  }

  if (opts.label) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.label, 128, 44);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    plate.position.set(0, 0.62, isSport ? 2.24 : 2.09);
    group.add(plate);
  }

  group.userData.wheels = wheels;
  return group;
}

// Arcade car: position on the ground plane, a heading, a speed and a
// steering angle. Forward is (sin(heading), cos(heading)) on (x, z).
export class Car {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.color = opts.color !== undefined ? opts.color : pick(CAR_COLORS);
    this.mesh = makeCarMesh(this.color, opts);
    this.mesh.position.set(opts.x || 0, 0, opts.z || 0);
    this.mesh.rotation.y = opts.heading || 0;
    scene.add(this.mesh);
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = opts.maxSpeed || 30;
    this.accel = opts.accel || 16;
    this.brake = opts.brake || 26;
    this.isPolice = !!opts.police;
    this.isPlayerCar = false;
    this.stolen = false;
    this.dead = false;
    this.wheelSpin = 0;
    this.damageFlash = 0;
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }

  // throttle: 1 forward, -1 reverse/brake, 0 coast. steerInput: -1..1.
  // handbrake: strong decel plus a sharper turn.
  drive(dt, throttle, steerInput, handbrake) {
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) {
        this.speed -= this.brake * dt; // braking
      } else {
        this.speed -= this.accel * 0.55 * dt; // reverse
      }
    } else {
      this.speed -= Math.sign(this.speed) * 6 * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    if (handbrake) {
      this.speed -= Math.sign(this.speed) * 22 * dt;
      if (Math.abs(this.speed) < 0.5) this.speed = 0;
    }
    const maxReverse = -10;
    this.speed = clamp(this.speed, maxReverse, this.maxSpeed);
    // Steering only bites while moving; handbrake sharpens it.
    const steerTarget = steerInput * (handbrake ? 0.62 : 0.48);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const turnRate = this.steer * clamp(Math.abs(this.speed) / 8, 0, 1) * 1.9;
    this.heading += turnRate * dt * Math.sign(this.speed || 1);
    this.x += this.forwardX * this.speed * dt;
    this.z += this.forwardZ * this.speed * dt;
    this._syncMesh(dt);
  }

  // Move without input (used by traffic that steers itself).
  integrate(dt) {
    this.x += this.forwardX * this.speed * dt;
    this.z += this.forwardZ * this.speed * dt;
    this._syncMesh(dt);
  }

  _syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += this.speed * dt * 2.2;
    const wheels = this.mesh.userData.wheels || [];
    for (const wheel of wheels) {
      wheel.rotation.x = this.wheelSpin;
    }
    // Front wheels visually steer.
    if (wheels.length >= 4) {
      wheels[0].rotation.y = this.steer * 0.7;
      wheels[1].rotation.y = this.steer * 0.7;
    }
    if (this.damageFlash > 0) this.damageFlash -= dt;
  }

  stop() {
    this.speed = 0;
    this.steer = 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.dead = true;
  }
}

// Parked cars scattered around the city for the player to steal.
export function spawnParkedCars(scene, city, count) {
  const parked = [];
  const spots = [
    { x: -53.2, z: 12, heading: 0 },
    { x: 53.2, z: -12, heading: Math.PI },
    { x: 12, z: -53.2, heading: Math.PI / 2 },
    { x: -12, z: 53.2, heading: -Math.PI / 2 },
    { x: 53.2, z: 88, heading: 0 },
    { x: -88, z: -53.2, heading: Math.PI / 2 },
    { x: 88, z: 53.2, heading: -Math.PI / 2 },
    { x: -53.2, z: -88, heading: 0 },
    { x: 3.2, z: 88, heading: 0 },
    { x: 3.2, z: -88, heading: 0 },
  ];
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const spot = spots[i];
    const car = new Car(scene, {
      x: spot.x, z: spot.z, heading: spot.heading,
      color: CAR_COLORS[i % CAR_COLORS.length],
    });
    car.parked = true;
    parked.push(car);
  }
  return parked;
}
