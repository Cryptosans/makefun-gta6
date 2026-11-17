// Solara Bay — traffic: 14 cars looping the blocks on the road grid. Each
// car follows its rectangular loop corner to corner, slows for the car
// ahead, and honks never. Stealing one is a crime (see police.js).
import { CONFIG } from './config.js';
import { Car } from './vehicles.js';
import { pick, dist2D } from './utils.js';

export class Traffic {
  constructor(scene, loops) {
    this.cars = [];
    this.loops = loops;
    for (let i = 0; i < CONFIG.traffic.count; i++) {
      const loop = loops[i % loops.length];
      const corner = i % 4;
      const start = loop[corner];
      const car = new Car(scene, start.x, start.z, 0, pick([0xd23b3b, 0x3b7dd2, 0xe8c33a, 0x37b268, 0xe8e8e8, 0x22262b]), 'traffic');
      car.loop = loop;
      car.corner = (corner + 1) % 4;
      car.speed = CONFIG.traffic.speed * (0.85 + Math.random() * 0.3);
      car.cruise = car.speed;
      this.cars.push(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      const target = car.loop[car.corner];
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5) {
        car.corner = (car.corner + 1) % 4;
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, dt * 3.2);
      car.mesh.rotation.y = car.heading;
      // Slow down for the car ahead on the same stretch.
      let speed = car.cruise;
      for (const other of this.cars) {
        if (other === car) continue;
        const od = dist2D(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
        if (od < CONFIG.traffic.minGap) {
          const ahead = (other.pos.x - car.pos.x) * Math.sin(car.heading)
            + (other.pos.z - car.pos.z) * Math.cos(car.heading);
          if (ahead > 0) { speed = Math.min(speed, car.cruise * 0.35); break; }
        }
      }
      car.pos.x += Math.sin(car.heading) * speed * dt;
      car.pos.z += Math.cos(car.heading) * speed * dt;
      for (const w of car.wheels) w.rotation.x += speed * dt * 1.4;
    }
  }
}
