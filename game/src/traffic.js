// traffic.js — 14 AI cars that follow the road grid, turn at intersections,
// brake for the car ahead, and stop briefly at random intersections.
import { Car } from './vehicles.js';
import { ROAD_COORDS } from './city.js';
import { clamp, rand, pick } from './utils.js';

const LANES = [-2.2, 2.2];

export class TrafficCar {
  constructor(scene, id) {
    this.car = new Car(scene, { id: 'traffic-' + id, maxSpeed: rand(9, 13), accel: 8 });
    this.axis = pick(['x', 'z']); // road direction
    this.road = pick(ROAD_COORDS);
    this.lane = pick(LANES);
    this.dir = pick([-1, 1]);
    this.pos = rand(-95, 95); // coordinate along the road
    this.waitTimer = 0;
    this.speedTarget = this.car.maxSpeed;
    this.syncMesh();
  }
  syncMesh() {
    if (this.axis === 'z') {
      // Travelling along z: heading 0 (dir +1) or PI (dir -1).
      this.car.setPos(this.road + this.lane * this.dir, this.pos, this.dir > 0 ? 0 : Math.PI);
      // Lane offset: keep right-hand side relative to travel direction.
      this.car.mesh.position.x = this.road + (this.dir > 0 ? this.lane : -this.lane);
    } else {
      this.car.setPos(this.pos, this.road + this.lane * this.dir, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.car.mesh.position.z = this.road + (this.dir > 0 ? -this.lane : this.lane);
    }
  }
  // Distance to the nearest car ahead on the same road/lane.
  aheadGap(others, playerCar) {
    let gap = 999;
    const all = others.concat(playerCar ? [playerCar] : []);
    for (const o of all) {
      if (!o || o === this.car) continue;
      const dx = o.x - this.car.x;
      const dz = o.z - this.car.z;
      if (this.axis === 'z') {
        if (Math.abs(dx) > 3.5) continue;
        const along = (o.z - this.car.z) * this.dir;
        if (along > 0 && along < gap) gap = along;
      } else {
        if (Math.abs(dz) > 3.5) continue;
        const along = (o.x - this.car.x) * this.dir;
        if (along > 0 && along < gap) gap = along;
      }
    }
    return gap;
  }
  update(dt, others, playerCar) {
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this.car.speed = 0;
      this.syncMesh();
      return;
    }
    const gap = this.aheadGap(others, playerCar);
    let target = this.speedTarget;
    if (gap < 9) target = 0;
    else if (gap < 16) target = this.speedTarget * 0.4;
    // Ease speed toward target.
    this.car.speed += clamp(target - this.car.speed, -14 * dt, 8 * dt);
    this.pos += this.car.speed * this.dir * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const nearIntersection = ROAD_COORDS.some((c) => Math.abs(this.pos - c) < 0.6);
    if (nearIntersection && Math.random() < dt * 0.25) {
      const newRoad = this.pos;
      // Snap to the nearest road coordinate.
      const snapped = ROAD_COORDS.reduce((a, b) => (Math.abs(b - this.pos) < Math.abs(a - this.pos) ? b : a));
      this.axis = this.axis === 'z' ? 'x' : 'z';
      this.road = snapped;
      this.pos = this.axis === 'z' ? this.car.x : this.car.z;
      // Keep position on the new road: pos becomes coordinate along new axis.
      if (this.axis === 'z') this.pos = this.car.z; else this.pos = this.car.x;
      this.dir = pick([-1, 1]);
      this.lane = pick(LANES);
    }
    // Wrap around the city edge.
    if (this.pos > 104) { this.pos = -104; }
    if (this.pos < -104) { this.pos = 104; }
    // Occasional random pause at an intersection (yields, feels alive).
    if (nearIntersection && Math.random() < dt * 0.02) this.waitTimer = rand(0.8, 2.2);
    this.syncMesh();
  }
}

export class TrafficSystem {
  constructor(scene) {
    this.cars = [];
    for (let i = 0; i < 14; i++) this.cars.push(new TrafficCar(scene, i));
  }
  update(dt, playerCar) {
    const meshes = this.cars.map((t) => t.car);
    for (const t of this.cars) {
      const others = meshes.filter((m) => m !== t.car);
      t.update(dt, others, playerCar);
    }
  }
  nearestCar(x, z, maxDist = 5) {
    let best = null, bd = maxDist;
    for (const t of this.cars) {
      const d = Math.hypot(t.car.x - x, t.car.z - z);
      if (d < bd) { bd = d; best = t.car; }
    }
    return best;
  }
}
