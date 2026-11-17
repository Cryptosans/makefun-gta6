// Solara Bay — the wanted system and the Solara Bay PD. Stars 0–5: crimes
// add stars, calm time sheds them, and one police cruiser per star hunts
// the player. Busted on foot, or wrecked in a car, costs a fine and a trip
// to the hospital.
import { CONFIG, PLACES } from './config.js';
import { Car } from './vehicles.js';
import { clamp, dist2D } from './utils.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.wanted = 0;
    this.calmTimer = 0;
    this.bustTimer = 0;
    this.cars = [];
    this._sirenPhase = 0;
  }

  addWanted(n, reason) {
    if (n <= 0) return;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.calmTimer = 0;
    if (this.wanted > 0) this._syncCars();
    return reason;
  }

  clearWanted() {
    this.wanted = 0;
    this.calmTimer = 0;
    this._syncCars();
  }

  /** Spawn/despawn cruisers to match the star count. */
  _syncCars() {
    while (this.cars.length < this.wanted) {
      const angle = Math.random() * Math.PI * 2;
      const r = 55 + Math.random() * 25;
      const car = new Car(this.scene, 0, 0, 0, 0x1a1d22, 'police');
      car.pos.set(
        clamp(Math.cos(angle) * r, -250, 250),
        0,
        clamp(Math.sin(angle) * r, -250, 210),
      );
      car.speed = 0;
      this.cars.push(car);
    }
    while (this.cars.length > this.wanted) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
  }

  /** Chase the player; returns 'busted' | 'wrecked' | null. */
  update(dt, player, drivenCar, onCrimeCooldown) {
    // Wanted decay after calm time.
    if (this.wanted > 0) {
      this.calmTimer += dt;
      if (this.calmTimer >= CONFIG.police.decaySeconds) {
        this.wanted -= 1;
        this.calmTimer = 0;
        this._syncCars();
      }
    }
    const target = drivenCar ? drivenCar.pos : player.pos;
    const playerSpeed = drivenCar ? Math.abs(drivenCar.speed) : player.speed;
    let busted = false;
    for (const car of this.cars) {
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, dt * 2.4);
      car.mesh.rotation.y = car.heading;
      const speed = Math.min(
        CONFIG.police.baseSpeed + this.wanted * CONFIG.police.speedPerStar,
        playerSpeed + 9,
      );
      car.speed = speed;
      car.pos.x += Math.sin(car.heading) * speed * dt;
      car.pos.z += Math.cos(car.heading) * speed * dt;
      for (const w of car.wheels) w.rotation.x += speed * dt * 1.4;
      // Flash the light bar.
      this._sirenPhase += dt * 8;
      const red = car.mesh.getObjectByName('sirenRed');
      const blue = car.mesh.getObjectByName('sirenBlue');
      const on = Math.sin(this._sirenPhase) > 0;
      if (red) red.material.emissiveIntensity = on ? 2.2 : 0.25;
      if (blue) blue.material.emissiveIntensity = on ? 0.25 : 2.2;
      // Contact: on foot it builds a bust; in a car it rams and damages.
      if (d < 3.6) {
        if (drivenCar) {
          drivenCar.health = Math.max(0, drivenCar.health - 26 * dt);
          drivenCar.speed *= 1 - 0.35 * dt;
          if (drivenCar.health <= 0) return 'wrecked';
        } else {
          this.bustTimer += dt;
          if (this.bustTimer >= CONFIG.police.bustSeconds) busted = true;
        }
      }
    }
    if (this.cars.length === 0) this.bustTimer = 0;
    else if (!this.cars.some((c) => dist2D(c.pos.x, c.pos.z, target.x, target.z) < 3.6)) {
      this.bustTimer = Math.max(0, this.bustTimer - dt);
    }
    if (busted) return 'busted';
    return null;
  }

  /** Busted/wrecked: fine, hospital respawn, clean slate. */
  respawnPlayer(player, state) {
    state.cash = Math.max(0, state.cash - CONFIG.police.fine);
    player.reset(PLACES.hospital);
    player.health = CONFIG.player.maxHealth;
    this.clearWanted();
  }
}
