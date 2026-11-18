// police.js — wanted level 0-5, police cruisers that ram the player,
// foot cops who chase, punch, and shoot at higher wanted levels.
// Heat decays when no police can see the player.
import * as THREE from 'three';
import { Car, makeCarMesh } from './vehicles.js';
import { clamp, dist2d, rand } from './utils.js';
import { makePedMesh } from './pedestrians.js';

export const WANTED_NAMES = ['Clean', 'Suspicious', 'Wanted', 'Hot', 'Man hunt', 'Lockdown'];

export class FootCop {
  constructor(scene, x, z) {
    this.mesh = makePedMesh();
    // Recolour to a navy uniform.
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) {
        // Keep the head skin; recolour torso/arms navy.
        if (o.position.y > 0.9 && o.position.y < 1.5) o.material = new THREE.MeshLambertMaterial({ color: 0x1f2a44 });
      }
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x101828 }));
    cap.position.y = 1.82;
    this.mesh.add(cap);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = 100;
    this.speed = 3.4;
    this.punchTimer = 0;
    this.shootTimer = rand(1, 2);
    this.walkPhase = rand(0, 6);
  }
  update(dt, px, pz, wanted, onShoot, onPunch) {
    const d = dist2d(this.x, this.z, px, pz);
    const want = Math.atan2(px - this.x, pz - this.z);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -3 * dt, 3 * dt);
    if (d > 1.6) {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * 8;
    const swing = Math.sin(this.walkPhase) * 0.5;
    if (this.mesh.userData.armL) this.mesh.userData.armL.rotation.x = swing;
    if (this.mesh.userData.armR) this.mesh.userData.armR.rotation.x = -swing;
    this.punchTimer -= dt;
    if (d < 2.0 && this.punchTimer <= 0) {
      this.punchTimer = 1.1;
      if (onPunch) onPunch(8);
    }
    // Shoot at wanted 3+ from range.
    if (wanted >= 3 && d > 4 && d < 26) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = rand(1.2, 2.4);
        if (onShoot) onShoot(this.x, this.z, px, pz);
      }
    }
  }
  dispose() { this.scene.remove(this.mesh); }
}

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.wanted = 0;
    this.heat = 0; // 0..100 within the current level
    this.cruisers = [];
    this.cops = [];
    this.loseTimer = 0;
    this.spawnTimer = 0;
    this.flash = 0;
  }
  addHeat(amount) {
    this.heat += amount;
    const level = Math.min(5, Math.floor(this.heat / 20));
    if (level > this.wanted) {
      this.wanted = level;
      this.spawnTimer = 0; // spawn reinforcements immediately
    }
  }
  setWanted(level) {
    this.wanted = clamp(level, 0, 5);
    this.heat = this.wanted * 20;
  }
  // How many cruisers / cops the current level fields.
  desiredCounts() {
    return {
      cruisers: this.wanted === 0 ? 0 : Math.min(4, this.wanted),
      cops: this.wanted === 0 ? 0 : Math.min(4, this.wanted + 1),
    };
  }
  spawnCruiser(px, pz) {
    // Spawn on a road 45-60 units away from the player.
    const angle = rand(0, Math.PI * 2);
    const x = clamp(px + Math.cos(angle) * rand(45, 60), -100, 100);
    const z = clamp(pz + Math.sin(angle) * rand(45, 60), -100, 100);
    const c = new Car(this.scene, { x, z, heading: Math.atan2(px - x, pz - z), color: 0x111111, police: true, maxSpeed: 30, accel: 16, id: 'police-' + Date.now() + '-' + Math.floor(rand(0, 9999)) });
    c.isPolice = true;
    this.cruisers.push(c);
    return c;
  }
  spawnCop(px, pz) {
    const angle = rand(0, Math.PI * 2);
    const cop = new FootCop(this.scene, clamp(px + Math.cos(angle) * rand(10, 18), -104, 104), clamp(pz + Math.sin(angle) * rand(10, 18), -104, 104));
    this.cops.push(cop);
    return cop;
  }
  update(dt, player, onPlayerHit, audio) {
    const px = player.x, pz = player.z;
    this.flash += dt;
    // --- Decay: if wanted > 0 and no police is close / has line of sight,
    // heat drains; at 0 the wanted level drops.
    const anyNear = this.cruisers.some((c) => dist2d(c.x, c.z, px, pz) < 45) ||
      this.cops.some((c) => dist2d(c.x, c.z, px, pz) < 30);
    if (this.wanted > 0) {
      if (!anyNear) {
        this.loseTimer += dt;
        if (this.loseTimer > 4) {
          this.heat -= dt * 6;
          if (this.heat <= (this.wanted - 1) * 20) {
            this.wanted = Math.max(0, this.wanted - 1);
            this.loseTimer = 0;
          }
        }
      } else {
        this.loseTimer = 0;
      }
    }
    // --- Spawn / despawn to match the wanted level.
    const want = this.desiredCounts();
    this.spawnTimer -= dt;
    if (this.cruisers.length < want.cruisers && this.spawnTimer <= 0) {
      this.spawnCruiser(px, pz);
      this.spawnTimer = 1.2;
    }
    if (this.cops.length < want.cops && this.spawnTimer <= 0 && !player.inCar) {
      this.spawnCop(px, pz);
      this.spawnTimer = 1.5;
    }
    // Despawn extras when wanted falls.
    while (this.cruisers.length > want.cruisers) { const c = this.cruisers.pop(); c.dispose(); }
    while (this.cops.length > want.cops) { const c = this.cops.pop(); c.dispose(); }
    // --- Cruisers ram the player (car or on foot).
    for (const c of this.cruisers) {
      const d = dist2d(c.x, c.z, px, pz);
      const wantHeading = Math.atan2(px - c.x, pz - c.z);
      let diff = wantHeading - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.4, -1, 1);
      const throttle = d > 4 ? 1 : 0.4;
      c.drive(throttle, steer, false, dt, this.colliders);
      if (d < 3.2) {
        // Ram: shove the player and deal damage on a cooldown.
        if (!c._ramTimer || c._ramTimer <= 0) {
          c._ramTimer = 1.4;
          if (onPlayerHit) onPlayerHit(player.inCar ? 6 : 12, 'rammed by a police cruiser');
          if (audio) audio.punch();
          c.speed *= -0.4;
        }
      }
      c._ramTimer = (c._ramTimer || 0) - dt;
      // Siren light flash (swap bar colour).
      const bar = c.mesh.children.find((ch) => ch.geometry && ch.geometry.parameters && ch.geometry.parameters.width === 1.2);
      if (bar) bar.material.color.setHex(Math.sin(this.flash * 8) > 0 ? 0xff2222 : 0x2244ff);
    }
    // --- Foot cops chase.
    for (const cop of this.cops) {
      cop.update(dt, px, pz, this.wanted,
        (sx, sz, tx, tz) => { if (onPlayerHit) onPlayerHit(0, 'shot'); if (this._onCopShot) this._onCopShot(sx, sz, tx, tz); },
        (dmg) => { if (onPlayerHit) onPlayerHit(dmg, 'punched by a cop'); });
    }
    if (audio) audio.setSiren(this.wanted > 0, dt);
  }
  clearAll() {
    for (const c of this.cruisers) c.dispose();
    for (const c of this.cops) c.dispose();
    this.cruisers = [];
    this.cops = [];
    this.wanted = 0;
    this.heat = 0;
  }
}
