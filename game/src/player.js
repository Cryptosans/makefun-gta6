// Solara Bay — Rico Vega on foot: movement, the player mesh, entering/exiting cars.
import * as THREE from 'three';
import { clamp, collideCircle } from './utils.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  const tee = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xff2e88 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.88, 0.38), tee);
  body.position.y = 1.06; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.76; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.13, 12), capMat);
  cap.position.y = 1.96;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), capMat);
  brim.position.set(0, 1.92, 0.28);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.72, 0.27), jeans);
  legL.position.set(-0.17, 0.36, 0);
  const legR = legL.clone(); legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.21), tee);
  armL.position.set(-0.45, 1.06, 0);
  const armR = armL.clone(); armR.position.x = 0.45;
  g.add(body, head, cap, brim, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

const WALK_SPEED = 4.5;
const RUN_SPEED = 8.5;

export class Player {
  constructor(scene, city, input) {
    this.scene = scene;
    this.city = city;
    this.input = input;
    this.x = 0; this.z = 20;
    this.heading = 0;
    this.health = 100;
    this.inCar = false;
    this.car = null;
    this.walkPhase = 0;
    this.moveSpeed = 0;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(this.x, 0, this.z);
    this.scene.add(this.mesh);
  }

  reset(x, z) {
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = 100;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.set(x, 0, z);
  }

  // On-foot movement. camYaw: camera view direction angle (forward = sin/cos).
  updateOnFoot(dt, camYaw) {
    const fwd = this.input.forward;
    const strafe = this.input.strafe;
    if (fwd === 0 && strafe === 0) {
      this.moveSpeed = 0;
      this._animate(0, dt);
      this.mesh.position.set(this.x, 0, this.z);
      return;
    }
    const speed = this.input.sprint ? RUN_SPEED : WALK_SPEED;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    this.x += mx * speed * dt;
    this.z += mz * speed * dt;
    const p = { x: this.x, z: this.z };
    collideCircle(p, 0.55, this.city.colliders);
    this.city.clampToWorld(p, 6);
    this.x = p.x; this.z = p.z;
    const wantHeading = Math.atan2(mx, mz);
    let diff = wantHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -10 * dt, 10 * dt);
    this.moveSpeed = speed;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this._animate(speed, dt);
  }

  _animate(speed, dt) {
    this.walkPhase += dt * speed * 2.6;
    const sw = speed > 0 ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = sw;
    u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.7;
    u.armR.rotation.x = sw * 0.7;
  }

  enterCar(car) {
    this.inCar = true;
    this.car = car;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    this.inCar = false;
    this.car = null;
    car.speed = 0;
    // Step out on the driver's side.
    const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    this.x = car.x + side.x * 2.4;
    this.z = car.z + side.z * 2.4;
    const p = { x: this.x, z: this.z };
    collideCircle(p, 0.55, this.city.colliders);
    this.x = p.x; this.z = p.z;
    this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return car;
  }

  // Keep the mesh glued to the car while driving.
  syncToCar() {
    if (this.car) {
      this.x = this.car.x;
      this.z = this.car.z;
      this.heading = this.car.heading;
    }
  }
}
