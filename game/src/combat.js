// combat.js — pistol combat, gang enemies and cash pickups.
// Shooting is a raycast from the camera centre with a visible tracer.
// Enemies are box figures with a floating health bar; kills drop cash
// pickups that the player collects by walking over them.

import * as THREE from 'three';
import { rand, pick, dist2D, clamp } from './utils.js';

const ENEMY_SHIRTS = [0x8a1a1a, 0x5a1a6a, 0x1a4a1a, 0x6a6a1a];

function makeHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  sprite.scale.set(1.6, 0.2, 1);
  sprite.renderOrder = 5;
  return { sprite, canvas, tex };
}

export class Combat {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = [];
    this.pickups = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.ammo = Infinity; // The pistol never runs dry in Solara Bay.
    this.shootCooldown = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);
    this.pickupGroup = new THREE.Group();
    scene.add(this.pickupGroup);
  }

  spawnEnemy(x, z, hp = 100) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.9, 0.38),
      new THREE.MeshLambertMaterial({ color: pick(ENEMY_SHIRTS) })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    mesh.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshLambertMaterial({ color: pick([0xe8b88a, 0xc98d5f, 0x8a5a34]) })
    );
    head.position.y = 1.7;
    mesh.add(head);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.1, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xdd2222 })
    );
    band.position.y = 1.86;
    mesh.add(band);
    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.62, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    legL.position.set(-0.16, 0.31, 0);
    mesh.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    mesh.add(legR);
    // A dark pistol box in the enemy's hand reads at a distance.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    gun.position.set(0.42, 1.1, 0.25);
    mesh.add(gun);
    const bar = makeHealthBar();
    bar.sprite.position.y = 2.25;
    mesh.add(bar.sprite);
    mesh.position.set(x, 0, z);
    this.group.add(mesh);
    const enemy = {
      mesh, bar, legL, legR,
      x, z, hp, maxHp: hp,
      heading: rand(0, Math.PI * 2),
      walkPhase: rand(0, 6),
      shootCooldown: rand(1.2, 2.6),
      punchCooldown: 0,
      hostile: true,
      dead: false,
    };
    this._drawBar(enemy);
    this.enemies.push(enemy);
    return enemy;
  }

  _drawBar(enemy) {
    const ctx = enemy.bar.canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 8);
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, 64, 8);
    const frac = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.fillStyle = frac > 0.5 ? '#3ddc5a' : frac > 0.25 ? '#ffcc33' : '#ff3333';
    ctx.fillRect(1, 1, 62 * frac, 6);
    enemy.bar.tex.needsUpdate = true;
  }

  spawnPickup(x, z, amount) {
    const mesh = new THREE.Group();
    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.12, 0.5),
      new THREE.MeshLambertMaterial({
        color: 0x2fae4e, emissive: 0x1a7a30, emissiveIntensity: 0.5,
      })
    );
    mesh.add(bill);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.14, 0.52),
      new THREE.MeshLambertMaterial({ color: 0xffd94d })
    );
    mesh.add(band);
    mesh.position.set(x, 0.7, z);
    this.pickupGroup.add(mesh);
    this.pickups.push({ mesh, x, z, amount, spin: rand(0, 6) });
  }

  // Player fires the pistol toward the camera aim point.
  playerShoot(origin, direction) {
    if (this.shootCooldown > 0) return;
    this.shootCooldown = 0.22;
    this.world.audio.shot();
    const from = origin.clone();
    const to = origin.clone().add(direction.clone().multiplyScalar(90));
    // Sprites (enemy health bars) need the camera set to be raycast.
    this.raycaster.camera = this.world.camera;
    this.raycaster.set(from, direction.clone().normalize());
    this.raycaster.far = 90;
    const targets = [];
    for (const enemy of this.enemies) {
      if (!enemy.dead) targets.push(enemy.mesh);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = to;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      // Walk up the parent chain to find the enemy record.
      let node = hit.object;
      while (node && node.parent !== this.group) node = node.parent;
      const enemy = this.enemies.find((e) => e.mesh === node);
      if (enemy) this.damageEnemy(enemy, 34);
    }
    this._addTracer(from, end, 0xffe9a0);
    // Gunfire is a crime: peds flee and heat rises a little.
    this.world.police.addHeat(2, this.world.player.x, this.world.player.z);
  }

  // A cop or enemy fires at a point; a short tracer shows the shot.
  enemyShootAt(fromX, fromY, fromZ, toX, toY, toZ, damage) {
    this.world.audio.enemyShot();
    const from = new THREE.Vector3(fromX, fromY, fromZ);
    const to = new THREE.Vector3(toX, toY, toZ);
    // Enemies miss sometimes at range so fights stay fair.
    const dist = from.distanceTo(to);
    const missChance = clamp(dist / 90, 0.15, 0.6);
    if (Math.random() > missChance) {
      this.world.damagePlayer(damage, 'shot');
    }
    this._addTracer(from, to, 0xff8866);
  }

  _addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    this.tracerGroup.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  damageEnemy(enemy, amount) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    this._drawBar(enemy);
    if (enemy.hp <= 0) {
      enemy.dead = true;
      this.group.remove(enemy.mesh);
      this.world.onEnemyKilled(enemy);
      this.spawnPickup(enemy.x + rand(-1, 1), enemy.z + rand(-1, 1), rand(60, 140));
    }
  }

  update(dt, playerX, playerZ, playerInCar) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    // Fade tracers out.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.12);
      if (tracer.life <= 0) {
        this.tracerGroup.remove(tracer.line);
        tracer.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Enemies hunt the player when close, shoot at range, punch up close.
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dist = dist2D(enemy.x, enemy.z, playerX, playerZ);
      enemy.shootCooldown -= dt;
      enemy.punchCooldown -= dt;
      const headingToPlayer = Math.atan2(playerX - enemy.x, playerZ - enemy.z);
      let diff = headingToPlayer - enemy.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff <= -Math.PI) diff += Math.PI * 2;
      enemy.heading += diff * Math.min(1, dt * 4);
      let speed = 0;
      if (dist > 26) {
        speed = 1.6; // patrol slowly until the player is near
        enemy.heading += Math.sin(this.world.elapsed * 0.4 + enemy.x) * dt * 0.5;
      } else if (dist > 3) {
        speed = 4.6; // close the distance
      }
      if (speed > 0 && !playerInCar) {
        enemy.x += Math.sin(enemy.heading) * speed * dt;
        enemy.z += Math.cos(enemy.heading) * speed * dt;
      }
      const fixed = this.world.city.resolveCollisions(enemy.x, enemy.z, 0.6);
      enemy.x = fixed.x;
      enemy.z = fixed.z;
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
      enemy.mesh.rotation.y = enemy.heading;
      enemy.walkPhase += dt * speed * 3;
      const swing = Math.sin(enemy.walkPhase) * 0.5;
      enemy.legL.rotation.x = -swing;
      enemy.legR.rotation.x = swing;
      enemy.bar.sprite.material.opacity = dist < 45 ? 1 : 0;
      if (dist < 30 && dist > 3 && enemy.shootCooldown <= 0 && !playerInCar) {
        enemy.shootCooldown = rand(1.6, 2.8);
        this.enemyShootAt(enemy.x, 1.5, enemy.z, playerX, 1.2, playerZ, 4);
      }
      if (dist < 2.2 && enemy.punchCooldown <= 0 && !playerInCar) {
        enemy.punchCooldown = 1.0;
        this.world.damagePlayer(7, 'punched by a gang member');
        this.world.audio.punch();
      }
    }
    // Remove dead enemies from the list.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }
    // Cash pickups spin and bob; the player collects them on touch.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.spin += dt * 3;
      pickup.mesh.rotation.y = pickup.spin;
      pickup.mesh.position.y = 0.7 + Math.sin(this.world.elapsed * 3 + pickup.spin) * 0.15;
      if (dist2D(playerX, playerZ, pickup.x, pickup.z) < 2.2) {
        this.world.state.cash += pickup.amount;
        this.world.audio.cash();
        this.world.hud.flashMessage('+$' + pickup.amount, '#7ae08a');
        this.pickupGroup.remove(pickup.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  clearEnemies() {
    for (const enemy of this.enemies) this.group.remove(enemy.mesh);
    this.enemies = [];
  }
}
