// combat.js — pistol combat: player shooting with tracers, gang enemies
// with health bars, cash pickups on kills, enemy return fire.
import * as THREE from 'three';
import { clamp, dist2d, rand, pick } from './utils.js';
import { makePedMesh } from './pedestrians.js';

export class CashPickup {
  constructor(scene, x, z, amount) {
    this.scene = scene;
    this.x = x; this.z = z;
    this.amount = amount;
    this.taken = false;
    this.mesh = new THREE.Group();
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x2ecc71 }));
    bill.position.y = 0.5;
    this.mesh.add(bill);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dff9e, transparent: true, opacity: 0.35 }));
    glow.position.y = 0.5;
    this.mesh.add(glow);
    this.mesh.position.set(x, 0, z);
    this.phase = rand(0, 6);
    scene.add(this.mesh);
  }
  update(dt, px, pz) {
    this.phase += dt * 3;
    this.mesh.rotation.y += dt * 2;
    this.mesh.children[0].position.y = 0.5 + Math.sin(this.phase) * 0.12;
    if (!this.taken && dist2d(this.x, this.z, px, pz) < 1.8) {
      this.taken = true;
      this.scene.remove(this.mesh);
      return this.amount;
    }
    return 0;
  }
}

export class Enemy {
  constructor(scene, x, z, kind = 'viper') {
    this.scene = scene;
    this.kind = kind;
    this.mesh = makePedMesh();
    // Gang colours: Vipers purple, guards dark grey.
    const shirtColor = kind === 'guard' ? 0x2c3e50 : 0x8e44ad;
    this.mesh.traverse((o) => {
      if (o.isMesh && o.position.y > 0.9 && o.position.y < 1.5) {
        o.material = new THREE.MeshLambertMaterial({ color: shirtColor });
      }
    });
    // Health bar: green plane above the head, scaled by health.
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.14), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
    barBg.position.y = 2.15;
    this.mesh.add(barBg);
    const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.09), new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide }));
    barFg.position.set(0, 2.15, 0.01);
    this.mesh.add(barFg);
    this.barFg = barFg;
    // A pistol in hand (small dark box).
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.35, 1.0, 0.3);
    this.mesh.add(gun);
    this.x = x; this.z = z;
    this.heading = rand(0, Math.PI * 2);
    this.health = 100;
    this.maxHealth = 100;
    this.speed = rand(2.2, 3.0);
    this.shootTimer = rand(1, 2.5);
    this.strafeDir = pick([-1, 1]);
    this.strafeTimer = rand(1, 3);
    this.dead = false;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }
  damage(amount) {
    this.health -= amount;
    const f = clamp(this.health / this.maxHealth, 0, 1);
    this.barFg.scale.x = Math.max(0.001, f);
    this.barFg.position.x = -(1.24 * (1 - f)) / 2;
    this.barFg.material.color.setHex(f > 0.5 ? 0x2ecc71 : f > 0.25 ? 0xf39c12 : 0xe74c3c);
    if (this.health <= 0) this.dead = true;
    return this.dead;
  }
  update(dt, px, pz, onShoot) {
    if (this.dead) return;
    const d = dist2d(this.x, this.z, px, pz);
    const want = Math.atan2(px - this.x, pz - this.z);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -3 * dt, 3 * dt);
    // Keep 6-12 units away, strafe sideways.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeTimer = rand(1, 3); this.strafeDir *= -1; }
    let move = 0;
    if (d > 12) move = 1;
    else if (d < 6) move = -1;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const sx = Math.cos(this.heading) * this.strafeDir, sz = -Math.sin(this.heading) * this.strafeDir;
    this.x += (fx * move + sx * 0.6) * this.speed * dt;
    this.z += (fz * move + sz * 0.6) * this.speed * dt;
    this.x = clamp(this.x, -104, 104);
    this.z = clamp(this.z, -104, 104);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && d < 30) {
      this.shootTimer = rand(1.4, 2.8);
      if (onShoot) onShoot(this.x, this.z, px, pz);
    }
  }
  dispose() { this.scene.remove(this.mesh); }
}

export class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.pickups = [];
    this.tracers = [];
    this.ammo = 12;
    this.reserve = 999;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.enemyTracerMat = new THREE.MeshBasicMaterial({ color: 0xff5544 });
  }
  spawnEnemies(kind, cx, cz, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(3, 10);
      this.enemies.push(new Enemy(this.scene, clamp(cx + Math.cos(a) * r, -104, 104), clamp(cz + Math.sin(a) * r, -104, 104), kind));
    }
  }
  spawnPickup(x, z, amount) {
    this.pickups.push(new CashPickup(this.scene, x, z, amount));
  }
  // Fire the pistol from `from` along direction (dx, dz, dy). Returns hit enemy or null.
  shoot(from, dir, onHit) {
    if (this.fireCooldown > 0 || this.reloadTimer > 0) return null;
    if (this.ammo <= 0) { this.reload(); return null; }
    this.ammo -= 1;
    this.fireCooldown = 0.22;
    // Tracer: thin stretched box from muzzle toward the shot.
    const len = 60;
    const end = { x: from.x + dir.x * len, y: from.y + dir.y * len, z: from.z + dir.z * len };
    const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), this.tracerMat);
    const mid = { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2, z: (from.z + end.z) / 2 };
    tracer.position.set(mid.x, mid.y, mid.z);
    tracer.lookAt(end.x, end.y, end.z);
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.09 });
    // Hit test: nearest enemy within a cone of the shot line (2D + height).
    let best = null, bestD = 999;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.x - from.x, ez = e.z - from.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < 0 || along > 55) continue;
      const perp = Math.abs(ex * dir.z - ez * dir.x);
      if (perp < 1.4 && along < bestD) { best = e; bestD = along; }
    }
    if (best) {
      const killed = best.damage(34);
      if (onHit) onHit(best, killed);
    }
    if (this.ammo === 0) this.reload();
    return best;
  }
  enemyShoot(fromX, fromZ, tx, tz, onPlayerHit) {
    // Red tracer from enemy to player, with a hit chance by distance.
    const from = { x: fromX, y: 1.4, z: fromZ };
    const dx = tx - fromX, dz = tz - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / len, y: 0, z: dz / len };
    const end = { x: fromX + dir.x * len, y: 1.3, z: fromZ + dir.z * len };
    const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), this.enemyTracerMat);
    tracer.position.set((from.x + end.x) / 2, (from.y + end.y) / 2, (from.z + end.z) / 2);
    tracer.lookAt(end.x, end.y, end.z);
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.09 });
    const d = dist2d(fromX, fromZ, tx, tz);
    const hitChance = clamp(0.55 - d * 0.012, 0.08, 0.5);
    if (Math.random() < hitChance && onPlayerHit) onPlayerHit(7, 'shot by a gang member');
  }
  reload() {
    if (this.reloadTimer > 0 || this.ammo === 12) return;
    this.reloadTimer = 1.1;
  }
  update(dt, px, pz, callbacks) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = 12;
    }
    // Enemies.
    for (const e of this.enemies) {
      if (!e.dead) e.update(dt, px, pz, (sx, sz, tx, tz) => this.enemyShoot(sx, sz, tx, tz, callbacks.onPlayerHit));
    }
    // Remove dead enemies, drop cash.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.spawnPickup(e.x, e.z, pick([50, 75, 100]));
        if (callbacks.onEnemyKilled) callbacks.onEnemyKilled(e);
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    // Pickups.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const amt = this.pickups[i].update(dt, px, pz);
      if (amt > 0) {
        if (callbacks.onPickup) callbacks.onPickup(amt);
        this.pickups.splice(i, 1);
      } else if (this.pickups[i].taken) {
        this.pickups.splice(i, 1);
      }
    }
    // Tracers fade fast.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.mesh); this.tracers.splice(i, 1); }
    }
  }
  clearEnemies() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
  }
}
