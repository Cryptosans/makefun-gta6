// Solara Bay — combat: fists and a pistol, plus the Viper thugs of the
// Dockside Brawl. Raycast-free on purpose: shots test distance and facing
// against simple target lists, which is fast and deterministic.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, rand, pick } from './utils.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.weapon = 'fists'; // fists | pistol
    this.ammo = CONFIG.combat.pistolAmmo;
    this.reserve = CONFIG.combat.pistolReserve;
    this.shotTimer = 0;
    this.thugs = [];
    this.pickups = [];
    this._muzzle = null;
  }

  switchWeapon() {
    this.weapon = this.weapon === 'fists' ? 'pistol' : 'fists';
    return this.weapon;
  }

  reload() {
    if (this.weapon !== 'pistol' || this.ammo === CONFIG.combat.pistolAmmo || this.reserve === 0) return false;
    const need = CONFIG.combat.pistolAmmo - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    return true;
  }

  /** Spawn hostile Vipers around a point (mission 4). */
  spawnThugs(around, count) {
    this.clearThugs();
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const shirt = new THREE.MeshLambertMaterial({ color: 0x7a1f2b });
      const skin = new THREE.MeshLambertMaterial({ color: pick([0xc98d64, 0x8a5a3b, 0xe8b88a]) });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 0.6), shirt);
      torso.position.y = 1.4;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), skin);
      head.position.y = 2.4;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.66),
        new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
      band.position.y = 2.62;
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42),
        new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
      legL.position.set(-0.28, 0.48, 0);
      const legR = legL.clone();
      legR.position.x = 0.28;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.1, 0.32), skin);
      armL.position.set(-0.75, 1.4, 0);
      armL.name = 'armL';
      const armR = armL.clone();
      armR.position.x = 0.75;
      armR.name = 'armR';
      g.add(torso, head, band, legL, legR, armL, armR);
      const angle = (i / count) * Math.PI * 2;
      g.position.set(around.x + Math.cos(angle) * 9, 0, around.z + Math.sin(angle) * 9);
      this.scene.add(g);
      this.thugs.push({
        mesh: g, pos: g.position, health: CONFIG.combat.thugHealth,
        attackTimer: 0, swing: 0, dead: false,
      });
    }
  }

  clearThugs() {
    for (const t of this.thugs) this.scene.remove(t.mesh);
    this.thugs = [];
  }

  /** Spawn glowing cash packages (mission 5). */
  spawnPickups(around, count) {
    this.clearPickups();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.5;
      const r = 10 + i * 5;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.8, 1.1),
        new THREE.MeshLambertMaterial({ color: 0x2e7d32, emissive: 0x1b5e20, emissiveIntensity: 0.7 }),
      );
      m.position.set(around.x + Math.cos(angle) * r, 0.6, around.z + Math.sin(angle) * r);
      this.scene.add(m);
      this.pickups.push({ mesh: m, pos: m.position, taken: false });
    }
  }

  clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
  }

  /** Fists: hit the nearest thug/ped in front within range. Returns target or null. */
  punch(player, police, pedestrians) {
    if (this.weapon !== 'fists') return null;
    const px = player.pos.x;
    const pz = player.pos.z;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let best = null;
    let bestD = CONFIG.player.punchRange;
    const consider = (x, z, obj) => {
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d > bestD) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.25) return; // must be roughly in front
      bestD = d;
      best = obj;
    };
    for (const t of this.thugs) if (!t.dead) consider(t.pos.x, t.pos.z, { kind: 'thug', ref: t });
    for (const p of pedestrians.peds) consider(p.pos.x, p.pos.z, { kind: 'ped', ref: p });
    if (!best) return null;
    if (best.kind === 'thug') {
      best.ref.health -= CONFIG.player.punchDamage;
      if (best.ref.health <= 0 && !best.ref.dead) {
        best.ref.dead = true;
        this.scene.remove(best.ref.mesh);
      }
    } else {
      pedestrians.scare(px, pz, 14);
      police.addWanted(1, 'assault');
    }
    return best;
  }

  /** Pistol: hit the nearest target along the facing, within range. */
  shoot(player, police, pedestrians) {
    if (this.weapon !== 'pistol' || this.shotTimer > 0) return null;
    if (this.ammo <= 0) return { kind: 'empty' };
    this.shotTimer = CONFIG.combat.pistolCooldown;
    this.ammo -= 1;
    this._flashMuzzle(player);
    const px = player.pos.x;
    const pz = player.pos.z;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let best = null;
    let bestD = CONFIG.combat.pistolRange;
    const consider = (x, z, obj) => {
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d > bestD) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.92) return; // need a real line on the target
      bestD = d;
      best = obj;
    };
    for (const t of this.thugs) if (!t.dead) consider(t.pos.x, t.pos.z, { kind: 'thug', ref: t });
    for (const p of pedestrians.peds) consider(p.pos.x, p.pos.z, { kind: 'ped', ref: p });
    for (const c of police.cars) consider(c.pos.x, c.pos.z, { kind: 'cop', ref: c });
    if (!best) return { kind: 'miss' };
    if (best.kind === 'thug') {
      best.ref.health -= CONFIG.combat.pistolDamage;
      if (best.ref.health <= 0 && !best.ref.dead) {
        best.ref.dead = true;
        this.scene.remove(best.ref.mesh);
      }
    } else if (best.kind === 'ped') {
      pedestrians.scare(px, pz, 16);
      police.addWanted(2, 'shooting');
    } else {
      police.addWanted(1, 'shooting at police');
    }
    return best;
  }

  _flashMuzzle(player) {
    if (!this._muzzle) {
      this._muzzle = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe98a }),
      );
      this.scene.add(this._muzzle);
    }
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    this._muzzle.position.set(player.pos.x + fx * 1.4, 1.5, player.pos.z + fz * 1.4);
    this._muzzle.visible = true;
    setTimeout(() => { if (this._muzzle) this._muzzle.visible = false; }, 60);
  }

  /** Thugs walk at the player and swing when close. Returns damage dealt. */
  updateThugs(dt, player) {
    let damage = 0;
    for (const t of this.thugs) {
      if (t.dead) continue;
      const d = dist2D(t.pos.x, t.pos.z, player.pos.x, player.pos.z);
      const dx = player.pos.x - t.pos.x;
      const dz = player.pos.z - t.pos.z;
      if (d > 1.6) {
        const want = Math.atan2(dx, dz);
        let diff = want - t.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        t.mesh.rotation.y += diff * Math.min(1, dt * 4);
        t.pos.x += Math.sin(t.mesh.rotation.y) * CONFIG.combat.thugSpeed * dt;
        t.pos.z += Math.cos(t.mesh.rotation.y) * CONFIG.combat.thugSpeed * dt;
        t.swing += dt * 6;
      } else {
        t.attackTimer -= dt;
        const armR = t.mesh.getObjectByName('armR');
        if (armR) armR.rotation.x = Math.sin(t.swing * 3) * 1.1;
        if (t.attackTimer <= 0) {
          t.attackTimer = 1.1;
          damage += CONFIG.combat.thugDamage;
        }
      }
    }
    return damage;
  }

  /** Collect a package by walking over it. Returns count collected. */
  updatePickups(playerPos) {
    let got = 0;
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += 0.03;
      p.mesh.position.y = 0.6 + Math.sin(performance.now() * 0.003 + p.pos.x) * 0.15;
      if (dist2D(playerPos.x, playerPos.z, p.pos.x, p.pos.z) < 2.2) {
        p.taken = true;
        this.scene.remove(p.mesh);
        got++;
      }
    }
    return got;
  }

  update(dt) {
    if (this.shotTimer > 0) this.shotTimer -= dt;
  }

  get thugsLeft() {
    return this.thugs.filter((t) => !t.dead).length;
  }

  get pickupsLeft() {
    return this.pickups.filter((p) => !p.taken).length;
  }
}
