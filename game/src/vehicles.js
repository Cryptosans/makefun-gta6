// Solara Bay — cars: mesh builder, arcade driving, and stealing. A car is
// a body + cabin + four wheels; driven cars answer WASD, traffic cars are
// driven by traffic.js, parked cars wait to be stolen with E.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerpAngle, collideBuildings, clampToWorld, dist2D } from './utils.js';

const CAR_COLORS = [0xd23b3b, 0x3b7dd2, 0xe8c33a, 0x37b268, 0xe8e8e8, 0x22262b, 0xd26ab0, 0xef7d2e];

/** Build a car mesh. `police` adds a light bar and livery. Returns { group, wheels }. */
export function buildCarMesh(color, police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0x1a1d22 : color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ff });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), police ? paint : glass);
  cabin.position.set(0, 1.2, -0.25);
  g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.7), dark);
  nose.position.set(0, 0.5, 2.2);
  g.add(nose);
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.6 }));
  lightL.position.set(-0.7, 0.72, 2.26);
  const lightR = lightL.clone();
  lightR.position.x = 0.7;
  g.add(lightL, lightR);
  if (police) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.34, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    door.position.set(0, 0.66, -0.2);
    g.add(door);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), dark);
    barBase.position.set(0, 1.58, -0.25);
    g.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.4 }));
    red.position.set(-0.28, 1.7, -0.25);
    red.name = 'sirenRed';
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 1.4 }));
    blue.position.set(0.28, 1.7, -0.25);
    blue.name = 'sirenBlue';
    g.add(barBase, red, blue);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  return { group: g, wheels };
}

export class Car {
  constructor(scene, x, z, heading, color, kind = 'parked') {
    const { group, wheels } = buildCarMesh(color, kind === 'police');
    this.mesh = group;
    this.wheels = wheels;
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.speed = 0;
    this.health = CONFIG.car.maxHealth;
    this.kind = kind; // parked | traffic | police | driven
    this.steer = 0;
    this.color = color;
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Arcade drive step: throttle -1..1, steer -1..1. Returns crash flag. */
  drive(dt, throttle, steer, colliders, cars) {
    const c = CONFIG.car;
    if (throttle > 0) this.speed += c.accel * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -c.brake : c.reverseAccel * throttle) * dt;
    } else {
      this.speed -= this.speed * c.drag * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = clamp(this.speed, -c.maxReverseSpeed, c.maxSpeed);
    const dir = this.speed >= 0 ? 1 : -1;
    this.steer = THREE.MathUtils.damp(this.steer, steer, 8, dt);
    this.heading += this.steer * c.steerSpeed * dt * dir * clamp(Math.abs(this.speed) / 8, 0, 1);
    this.mesh.rotation.y = this.heading;
    const f = this.forward;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    // Wheel spin.
    for (const w of this.wheels) w.rotation.x += this.speed * dt * 1.4;
    // Building collision: bounce off with damage on hard hits.
    const hits = collideBuildings(this.pos, c.radius, colliders);
    if (hits > 0) {
      const impact = Math.abs(this.speed);
      if (impact > 12) {
        this.health = Math.max(0, this.health - (impact - 12) * 1.2);
        this.speed *= -0.25;
        return true;
      }
      this.speed *= 0.4;
    }
    // Soft car-vs-car push.
    for (const other of cars) {
      if (other === this) continue;
      const d = dist2D(this.pos.x, this.pos.z, other.pos.x, other.pos.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = (this.pos.x - other.pos.x) / d;
        const nz = (this.pos.z - other.pos.z) / d;
        this.pos.x += nx * push;
        this.pos.z += nz * push;
        if (Math.abs(this.speed) > 14) {
          this.health = Math.max(0, this.health - 4);
          return true;
        }
      }
    }
    clampToWorld(this.pos, CONFIG.world.halfSize - 2);
    return false;
  }
}

/** Parked cars the player can steal, plus their world spots. */
export function spawnParkedCars(scene, spots) {
  return spots.map((s, i) => new Car(scene, s.x, s.z, s.heading, CAR_COLORS[i % CAR_COLORS.length], 'parked'));
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = dist2D(x, z, car.pos.x, car.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
