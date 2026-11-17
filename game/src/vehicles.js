// Solara Bay — vehicles: low-poly car factory, traffic AI, arcade driving physics.
import * as THREE from 'three';
import { rand, pick, clamp, collideCircle, dist2D } from './utils.js';
import { streetCoords, HALF, ROAD } from './city.js';

export const CAR_COLORS = [0xd93a3a, 0x3a6fd9, 0xe8b93a, 0x3ad98a, 0xd9d9d9, 0x2c2c34, 0xd97b3a, 0x7b3ad9, 0x3ad9c9, 0x9fb3c9];

// A low-poly car built from boxes. Forward is local +Z.
export function makeCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.1), glassMat);
  cabin.position.set(0, 1.3, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), headMat);
    h.position.set(hx, 0.7, 2.21);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const tx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), tailMat);
    t.position.set(tx, 0.7, -2.21);
    group.add(t);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.4;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.x = 0.4;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.75, -0.25);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  group.userData.lightBar = lightBar;
  return group;
}

export class Car {
  constructor(mesh, x, z, heading, color, police = false) {
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.color = color;
    this.police = police;
    this.dead = false;
    this.sync();
  }
  get pos() { return { x: this.x, z: this.z }; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

const MAX_PLAYER_SPEED = 40;
const MAX_REVERSE_SPEED = 12;

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.spawnTimer = 0;
    for (let i = 0; i < 14; i++) this.spawnCar(true);
  }

  spawnCar(anywhere = false) {
    const p = this.city.randomRoadPoint();
    const horizontal = Math.random() < 0.5;
    const axis = horizontal ? 'x' : 'z';
    const dir = pick([-1, 1]);
    const lane = pick([-3.5, 3.5]);
    // Snap the car onto a road centre line with its lane offset.
    let cx, cz, heading;
    if (axis === 'x') {
      const street = this._nearestStreet(p.z);
      cx = anywhere ? rand(-HALF + 20, HALF - 20) : rand(-HALF, HALF);
      cz = street + lane;
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const street = this._nearestStreet(p.x);
      cx = street + lane;
      cz = anywhere ? rand(-HALF + 20, HALF - 20) : rand(-HALF, HALF);
      heading = dir > 0 ? 0 : Math.PI;
    }
    const color = pick(CAR_COLORS);
    const mesh = makeCarMesh(color);
    this.scene.add(mesh);
    const car = new Car(mesh, cx, cz, heading, color);
    car.axis = axis; car.dir = dir; car.lane = lane;
    car.cruise = rand(8, 13);
    car.targetSpeed = car.cruise;
    this.cars.push(car);
    return car;
  }

  _nearestStreet(v) {
    let best = streetCoords()[0], bd = Infinity;
    for (const s of streetCoords()) {
      const d = Math.abs(s - v);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  nearestCar(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = dist2D(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt, playerCar, onCrash) {
    const streets = streetCoords();
    for (const car of this.cars) {
      // Parked cars (ditched by the player) stay put.
      if (car.parked) { car.sync(); continue; }
      // Slow down for the car ahead on the same lane.
      let want = car.cruise;
      for (const o of this.cars) {
        if (o === car || o.axis !== car.axis || o.dir !== car.dir) continue;
        const along = car.axis === 'x' ? (o.x - car.x) * car.dir : (o.z - car.z) * car.dir;
        const lateral = car.axis === 'x' ? Math.abs(o.z - car.z) : Math.abs(o.x - car.x);
        if (along > 0 && along < 11 && lateral < 3) { want = Math.min(want, 2.5); break; }
      }
      // Slow for the player car ahead too.
      if (playerCar) {
        const along = car.axis === 'x' ? (playerCar.x - car.x) * car.dir : (playerCar.z - car.z) * car.dir;
        const lateral = car.axis === 'x' ? Math.abs(playerCar.z - car.z) : Math.abs(playerCar.x - car.x);
        if (along > 0 && along < 11 && lateral < 3) want = Math.min(want, 1.5);
      }
      car.targetSpeed = want;
      car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
      const step = car.speed * dt;
      if (car.axis === 'x') car.x += car.dir * step;
      else car.z += car.dir * step;
      // Turn at intersections sometimes; U-turn at the city edge.
      // A car on the x-axis is at an intersection when its x is near a street
      // coordinate (a vertical street); same mirrored for the z-axis.
      const alongCoord = car.axis === 'x' ? car.x : car.z;
      const nearStreet = streets.some((s) => Math.abs(alongCoord - s) < 4.5);
      if (nearStreet && Math.random() < dt * 0.25) {
        this._turn(car);
      } else if (alongCoord > HALF + 6 || alongCoord < -HALF - 6) {
        car.dir *= -1;
        car.heading += Math.PI;
      }
      // Keep glued to the road after a turn.
      car.sync();
      // Bump into buildings: shove back onto the road.
      const p = { x: car.x, z: car.z };
      if (collideCircle(p, 2.0, this.city.colliders)) { car.x = p.x; car.z = p.z; car.speed *= 0.6; }
    }
    // Top the fleet back up.
    this.spawnTimer -= dt;
    if (this.cars.length < 14 && this.spawnTimer <= 0) {
      this.spawnCar(false);
      this.spawnTimer = 2;
    }
    void onCrash;
  }

  _turn(car) {
    const streets = streetCoords();
    // Nearest street to the car's along-axis coordinate: the cross street it
    // is about to turn onto. Snap the car onto that street's lane.
    const along = car.axis === 'x' ? car.x : car.z;
    let nearest = streets[0], bd = Infinity;
    for (const s of streets) { const d = Math.abs(s - along); if (d < bd) { bd = d; nearest = s; } }
    if (bd > 5) return;
    const newAxis = car.axis === 'x' ? 'z' : 'x';
    const newDir = pick([-1, 1]);
    const lane = pick([-3.5, 3.5]);
    if (newAxis === 'z') {
      car.x = nearest + lane;
      car.heading = newDir > 0 ? 0 : Math.PI;
    } else {
      car.z = nearest + lane;
      car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.axis = newAxis; car.dir = newDir; car.lane = lane;
  }
}

// Arcade driving for the player's car. Returns events: {crashed:boolean, hitPed:boolean}
export function drivePlayerCar(car, input, dt, city, trafficCars, peds, audio) {
  const fwd = input.forward; // -1..1 (W/S)
  const steer = input.steer; // -1..1 (A/D)
  const handbrake = input.handbrake;
  const accel = 16;
  if (fwd > 0) car.speed += accel * dt;
  else if (fwd < 0) {
    if (car.speed > 0.5) car.speed -= 26 * dt;
    else car.speed -= 9 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed = clamp(car.speed, -MAX_REVERSE_SPEED, MAX_PLAYER_SPEED);
  const grip = handbrake ? 0.55 : 1;
  const turnRate = 1.9 * clamp(Math.abs(car.speed) / 12, 0.25, 1) * grip;
  car.heading += steer * turnRate * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  let crashed = false;
  const p = { x: car.x, z: car.z };
  if (collideCircle(p, 2.1, city.colliders)) {
    if (Math.abs(car.speed) > 9) { crashed = true; if (audio) audio.crash(); }
    car.speed *= 0.45;
    car.x = p.x; car.z = p.z;
  }
  city.clampToWorld(p, 4);
  car.x = p.x; car.z = p.z;
  // Nudge traffic cars out of the way.
  for (const t of trafficCars) {
    const d = dist2D(car.x, car.z, t.x, t.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / d;
      t.x += (t.x - car.x) * push * 0.6;
      t.z += (t.z - car.z) * push * 0.6;
      t.speed *= 0.7;
      if (Math.abs(car.speed) > 12) { crashed = true; if (audio) audio.crash(); car.speed *= 0.8; }
    }
  }
  car.sync();
  return { crashed };
}
