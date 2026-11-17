// Solara Bay — combat: shooting, gang enemies, tracers, cash pickups.
import * as THREE from 'three';
import { rand, pick, clamp, dist2D, collideCircle } from './utils.js';

const GANG_COLORS = [0x8f1d1d, 0x5e1d8f, 0x1d3a8f];

function makeGangMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: pick(GANG_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xe8b98a, 0xc98a5a, 0x8a5a3a]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.4), jacket);
  body.position.y = 1.05; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.74;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xd92020 }));
  band.position.y = 1.9;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pants);
  legL.position.set(-0.16, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
  armL.position.set(-0.44, 1.05, 0);
  const armR = armL.clone(); armR.position.x = 0.44;
  // Floating health bar.
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0x330000 }));
  barBg.position.y = 2.25;
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.07, 0.03), new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
  barFg.position.y = 2.25;
  g.add(body, head, band, legL, legR, armL, armR, barBg, barFg);
  g.userData = { legL, legR, armL, armR, barBg, barFg };
  return g;
}

export class Combat {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.gang = [];
    this.tracers = [];
    this.pickups = [];
    this.fireCooldown = 0;
    this.raycaster = new THREE.Raycaster();
  }

  spawnGang(x, z, count = 4) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const gx = x + rand(-8, 8), gz = z + rand(-8, 8);
      const mesh = makeGangMesh();
      mesh.position.set(gx, 0, gz);
      this.scene.add(mesh);
      const enemy = {
        mesh, x: gx, z: gz, heading: rand(Math.PI * 2),
        health: 100, speed: 4.6, shootTimer: rand(0.8, 2), phase: rand(10),
        state: 'guard', aggroRange: 34,
      };
      mesh.userData.enemy = enemy;
      this.gang.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  gangAlive() { return this.gang.filter((e) => e.health > 0).length; }

  clearGang() {
    for (const e of this.gang) this.scene.remove(e.mesh);
    this.gang = [];
  }

  spawnTracer(x1, y1, z1, x2, y2, z2, color = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  spawnPickup(x, z, amount) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x39d353, emissive: 0x1a5c22 }),
    );
    mesh.position.set(x, 0.6, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, amount, spin: 0 });
  }

  // Player fires from the camera through the crosshair.
  shoot(camera, player) {
    if (this.fireCooldown > 0) return false;
    this.fireCooldown = 0.14;
    this.game.audio.gunshot();
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.z += rand(-0.012, 0.012);
    dir.normalize();
    this.raycaster.set(origin, dir);
    this.raycaster.far = 90;
    const targets = [];
    for (const e of this.gang) if (e.health > 0) targets.push(e.mesh);
    for (const c of this.game.police.cops) targets.push(c.mesh);
    for (const p of this.game.peds.list) if (p.state !== 'down') targets.push(p.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    const end = origin.clone().addScaledVector(dir, 60);
    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      let obj = hit.object;
      while (obj && !obj.userData.enemy && !obj.userData.isCop && !obj.userData.isPed) obj = obj.parent;
      const enemy = obj ? obj.userData.enemy : null;
      if (enemy && enemy.health > 0) {
        enemy.health -= 34;
        this._hitSpark(hit.point);
        if (enemy.health <= 0) this._killGang(enemy);
        return true;
      }
      // Cop hit?
      const cop = this.game.police.cops.find((c) => c.mesh === obj);
      if (cop) {
        this._hitSpark(hit.point);
        this.game.police.addHeat(2, 'Cop down');
        this.game.peds.scare(cop.x, cop.z, 26);
        this._killCop(cop);
        return true;
      }
      const ped = this.game.peds.list.find((p) => p.mesh === obj);
      if (ped) {
        this._hitSpark(hit.point);
        this.game.peds.knockDown(ped);
        this.game.police.addHeat(2, 'Pedestrian hit');
        return true;
      }
    }
    this.spawnTracer(origin.x, origin.y, origin.z, end.x, end.y, end.z);
    return true;
  }

  _hitSpark(point) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5040 }),
    );
    s.position.copy(point);
    this.scene.add(s);
    this.tracers.push({ line: s, life: 0.18, spark: true });
  }

  _killGang(enemy) {
    enemy.health = 0;
    enemy.mesh.rotation.x = -Math.PI / 2;
    enemy.mesh.position.y = 0.3;
    this.spawnPickup(enemy.x + rand(-1, 1), enemy.z + rand(-1, 1), rand(80, 200));
    this.game.audio.pickup();
    setTimeout(() => {
      this.scene.remove(enemy.mesh);
      const i = this.gang.indexOf(enemy);
      if (i >= 0) this.gang.splice(i, 1);
    }, 4000);
  }

  _killCop(cop) {
    cop.mesh.rotation.x = -Math.PI / 2;
    cop.mesh.position.y = 0.3;
    setTimeout(() => {
      this.scene.remove(cop.mesh);
      const i = this.game.police.cops.indexOf(cop);
      if (i >= 0) this.game.police.cops.splice(i, 1);
    }, 4000);
  }

  update(dt, player) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    // Tracer / spark fade.
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        if (t.line.geometry) t.line.geometry.dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      } else if (t.spark) {
        t.line.scale.setScalar(1 + (0.18 - t.life) * 6);
      }
    }
    // Gang AI: guard until the player is near, then chase and shoot.
    for (const e of this.gang) {
      if (e.health <= 0) continue;
      const d = dist2D(player.x, player.z, e.x, e.z);
      if (e.state === 'guard' && d < e.aggroRange) e.state = 'hunt';
      if (e.state === 'hunt') {
        const want = Math.atan2(player.x - e.x, player.z - e.z);
        let diff = want - e.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.heading += clamp(diff, -3 * dt, 3 * dt);
        if (d > 9) {
          e.x += Math.sin(e.heading) * e.speed * dt;
          e.z += Math.cos(e.heading) * e.speed * dt;
          const p = { x: e.x, z: e.z };
          collideCircle(p, 0.5, this.city.colliders);
          e.x = p.x; e.z = p.z;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 34) {
          e.shootTimer = rand(1.1, 1.9);
          this.game.audio.gunshot();
          this.spawnTracer(e.x, 1.4, e.z, player.x, 1.3, player.z, 0xff8a5a);
          if (Math.random() < 0.35) this.game.damagePlayer(6, 'gang fire');
        }
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      e.phase += dt * e.speed * 2.4;
      const sw = e.state === 'hunt' ? Math.sin(e.phase) * 0.5 : 0;
      e.mesh.userData.legL.rotation.x = sw;
      e.mesh.userData.legR.rotation.x = -sw;
      // Health bar faces the camera and shrinks with damage.
      const cam = this.game.camera;
      e.mesh.userData.barBg.lookAt(cam.position);
      e.mesh.userData.barFg.lookAt(cam.position);
      const frac = Math.max(0, e.health / 100);
      e.mesh.userData.barFg.scale.x = frac;
      e.mesh.userData.barFg.position.x = -(1 - frac) * 0.43;
    }
    // Cash pickups spin; collect on touch.
    for (const pk of [...this.pickups]) {
      pk.spin += dt * 3;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.position.y = 0.6 + Math.sin(pk.spin * 1.5) * 0.15;
      if (dist2D(player.x, player.z, pk.x, pk.z) < 1.6) {
        this.game.addCash(pk.amount, 'Pickup');
        this.scene.remove(pk.mesh);
        this.pickups.splice(this.pickups.indexOf(pk), 1);
      }
    }
  }
}
