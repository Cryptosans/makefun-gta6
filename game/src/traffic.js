// traffic.js — 14 AI traffic cars that follow the road grid.
// Each car drives along a road line in a lane, turns at intersections
// with some probability, and brakes when the car ahead of it is close.
// They never leave the roads and they slow down for the player's car.

import { Car, CAR_COLORS } from './vehicles.js';
import { clamp, rand, randInt, pick, dist2D, angleDiff } from './utils.js';
import { GRID_LINES, ROAD_HALF } from './city.js';

const LANE = 3.2;

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this._spawnAll();
  }

  _spawnAll() {
    for (let i = 0; i < 14; i++) {
      this.cars.push(this._makeCar());
    }
  }

  _makeCar() {
    // Pick a random road line and a random direction along it.
    const alongNS = Math.random() < 0.5;
    const line = pick(GRID_LINES);
    const along = rand(-115, 115);
    const dir = Math.random() < 0.5 ? 1 : -1;
    let x, z, heading;
    if (alongNS) {
      x = line + (dir > 0 ? LANE : -LANE);
      z = along;
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      x = along;
      z = line + (dir > 0 ? LANE : -LANE);
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = new Car(this.scene, {
      x, z, heading,
      color: pick(CAR_COLORS),
      maxSpeed: rand(9, 13),
      accel: 8,
    });
    car.speed = rand(7, 11);
    car.traffic = true;
    car.axis = alongNS ? 'ns' : 'ew';
    car.line = line;
    car.dir = dir;
    car.turnCooldown = rand(1, 4);
    return car;
  }

  // Is there a vehicle roughly ahead of `car` within `range`?
  _carAhead(car, others, range) {
    let nearest = null;
    let nearestDist = range;
    for (const other of others) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > range || dist < 0.5) continue;
      // Ahead means the dot product with the forward vector is positive
      // and the lateral offset is small (same lane-ish).
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (along > 0 && lateral < 3.4 && dist < nearestDist) {
        nearest = other;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  update(dt, playerCar, playerX, playerZ, staticCars = []) {
    const allCars = this.cars;
    for (const car of this.cars) {
      car.turnCooldown -= dt;
      // Lane keeping: gently steer back onto the lane line.
      const laneOffset = car.axis === 'ns'
        ? car.x - (car.line + car.dir * LANE)
        : car.z - (car.line + car.dir * LANE);
      const desiredHeading = car.axis === 'ns'
        ? (car.dir > 0 ? 0 : Math.PI)
        : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const correction = clamp(-laneOffset * 0.06, -0.25, 0.25);
      const targetHeading = desiredHeading + correction * (car.axis === 'ns' ? 1 : -1);
      car.heading += angleDiff(car.heading, targetHeading) * Math.min(1, dt * 2.5);

      // Decide whether to turn at an intersection.
      const alongPos = car.axis === 'ns' ? car.z : car.x;
      const nearestLine = this.city.nearestRoadLine(alongPos);
      const distToCross = Math.abs(alongPos - nearestLine);
      if (car.turnCooldown <= 0 && distToCross < 2.5 && Math.random() < 0.35) {
        this._turnAtIntersection(car, nearestLine);
        car.turnCooldown = rand(4, 9);
      }

      // Brake for the car ahead, including parked cars and the player's car.
      let targetSpeed = car.maxSpeed;
      const ahead = this._carAhead(car, [...allCars, ...staticCars], 15);
      if (ahead) {
        const gap = dist2D(car.x, car.z, ahead.x, ahead.z);
        targetSpeed = Math.min(targetSpeed, Math.max(0, (gap - 7) * 1.2));
      }
      if (playerCar) {
        const gap = dist2D(car.x, car.z, playerCar.x, playerCar.z);
        if (gap < 13) {
          const dx = playerCar.x - car.x;
          const dz = playerCar.z - car.z;
          const along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
          if (along > 0) targetSpeed = Math.min(targetSpeed, Math.max(0, (gap - 8) * 1.0));
        }
      }
      // Smooth speed toward the target.
      if (car.speed < targetSpeed) {
        car.speed = Math.min(targetSpeed, car.speed + car.accel * dt);
      } else if (car.speed > targetSpeed) {
        car.speed = Math.max(targetSpeed, car.speed - 18 * dt);
      }
      car.integrate(dt);
      // A ram can shove a traffic car off the road; push it back out of
      // any building it ended up inside so it never gets wedged.
      const fixed = this.city.resolveCollisions(car.x, car.z, 1.6);
      car.x = fixed.x;
      car.z = fixed.z;

      // Keep cars inside the city; respawn far away if one escapes.
      if (Math.abs(car.x) > 128 || Math.abs(car.z) > 128) {
        const fresh = this._makeCar();
        const index = this.cars.indexOf(car);
        car.dispose();
        this.cars[index] = fresh;
      }
    }
  }

  _turnAtIntersection(car, crossLine) {
    // Turn 90 degrees onto the crossing road, either left or right.
    const turnLeft = Math.random() < 0.5;
    const turn = turnLeft ? Math.PI / 2 : -Math.PI / 2;
    const oldAxis = car.axis;
    if (oldAxis === 'ns') {
      car.axis = 'ew';
      car.line = crossLine;
      // Snap onto the crossing road line with a lane offset.
      const newDir = Math.sin(car.heading + turn) > 0 ? 1 : -1;
      car.dir = newDir;
      car.z = crossLine + newDir * LANE;
    } else {
      car.axis = 'ns';
      car.line = crossLine;
      const newDir = Math.cos(car.heading + turn) > 0 ? 1 : -1;
      car.dir = newDir;
      car.x = crossLine + newDir * LANE;
    }
    car.heading += turn;
    // Normalise heading into (-PI, PI].
    while (car.heading > Math.PI) car.heading -= Math.PI * 2;
    while (car.heading <= -Math.PI) car.heading += Math.PI * 2;
  }

  // All traffic cars, for minimap drawing and collision checks.
  all() {
    return this.cars;
  }
}
