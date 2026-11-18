// vehicles.js — procedural car factory + arcade driving physics.
// A car is a group of boxes: body, cabin, wheels, lights. No imported models.
import * as THREE from 'three';
import { clamp, rand, pick } from './utils.js';
import { collidesWithBuildings } from './city.js';

export const CAR_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x2c3e50, 0x16a085, 0xd35400];

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.05, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.5), bodyMat);
  nose.position.set(0, 0.5, 2.35);
  g.add(nose);
  // Headlights / taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    h.position.set(sx, 0.6, 2.62); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), tailMat);
    t.position.set(sx, 0.6, -2.24); g.add(t);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.42, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.19, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.62, 1.42, -0.2);
    g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.0), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72;
    g.add(stripe);
  }
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.0, -2.1);
    g.add(spoiler);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.color = opts.color ?? pick(CAR_COLORS);
    this.mesh = makeCarMesh(this.color, opts);
    this.mesh.position.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.mesh.rotation.y = opts.heading ?? 0;
    scene.add(this.mesh);
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.maxSpeed = opts.maxSpeed ?? 26;
    this.accel = opts.accel ?? 14;
    this.brake = 30;
    this.steer = 0;
    this.isPolice = !!opts.police;
    this.isPlayer = false;
    this.stolen = false;
    this.name = opts.name ?? 'Sedan';
    this.id = opts.id ?? ('car-' + Math.floor(rand(0, 1e9)));
    this.wheelSpin = 0;
  }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  setPos(x, z, heading) {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    if (heading !== undefined) { this.heading = heading; this.mesh.rotation.y = heading; }
  }
  // Arcade drive step. throttle -1..1, steerInput -1..1, dt seconds.
  drive(throttle, steerInput, handbrake, dt, colliders) {
    const targetSteer = clamp(steerInput, -1, 1);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) this.speed += this.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= this.brake * dt;
      else this.speed += this.accel * 0.55 * throttle * dt; // reverse
    }
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 3.2);
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.55 * dt;
    this.speed = clamp(this.speed, -9, this.maxSpeed);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    // Steering scales with speed, reverses when reversing.
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += this.steer * 1.9 * dt * clamp(Math.abs(this.speed) / 8, 0, 1) * dir;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // Building collision: stop and slide along.
    if (colliders && collidesWithBuildings(colliders, nx, nz, 1.6)) {
      // Try x-only, then z-only movement.
      if (!collidesWithBuildings(colliders, nx, this.z, 1.6)) {
        this.mesh.position.x = nx;
      } else if (!collidesWithBuildings(colliders, this.x, nz, 1.6)) {
        this.mesh.position.z = nz;
      } else {
        this.speed *= -0.25; // bounce off
      }
    } else {
      this.mesh.position.x = clamp(nx, -108, 112);
      this.mesh.position.z = clamp(nz, -108, 108);
    }
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += this.speed * dt * 2;
    for (const w of this.mesh.userData.wheels || []) w.rotation.x = this.wheelSpin;
    // Body lean / pitch for feel.
    this.mesh.rotation.z = -this.steer * 0.03 * clamp(Math.abs(this.speed) / 20, 0, 1);
    this.mesh.rotation.x = clamp(-throttle * 0.02 * clamp(Math.abs(this.speed) / 20, 0, 1), -0.03, 0.03);
  }
  dispose() {
    this.scene.remove(this.mesh);
  }
}

// Parked cars the player can steal, scattered along roads.
export function spawnParkedCars(scene) {
  const spots = [
    { x: 20, z: 3.5, heading: Math.PI / 2, color: 0xd35400, name: 'Comet GT', sport: true },
    { x: -38, z: 43.5, heading: 0, color: 0x2471a3, name: 'Marlin' },
    { x: 43.5, z: -20, heading: Math.PI, color: 0x27ae60, name: 'Bison' },
    { x: -20, z: -43.5, heading: Math.PI / 2, color: 0x8e44ad, name: 'Primo' },
    { x: 60, z: 83.5, heading: 0, color: 0xe67e22, name: 'Sultan' },
    { x: 83.5, z: 60, heading: -Math.PI / 2, color: 0xecf0f1, name: 'Taxi' },
    { x: -83.5, z: -40, heading: Math.PI / 2, color: 0x2c3e50, name: 'Voodoo' },
    { x: 0, z: 83.5, heading: Math.PI, color: 0xc0392b, name: 'Esperanto' },
  ];
  const cars = [];
  for (const s of spots) {
    const c = new Car(scene, { x: s.x, z: s.z, heading: s.heading, color: s.color, name: s.name, sport: !!s.sport, id: 'parked-' + s.name });
    cars.push(c);
  }
  return cars;
}
