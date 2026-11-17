// Solara Bay — wanted level, police pursuit cars and foot cops.
import * as THREE from 'three';
import { rand, clamp, dist2D, collideCircle, angleDiff } from './utils.js';
import { makeCarMesh, Car } from './vehicles.js';

const MAX_STARS = 5;

function makeCopMesh() {
  const g = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1d3f8f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.38), uniform);
  body.position.y = 1.05; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.14, 10), new THREE.MeshLambertMaterial({ color: 0x101a30 }));
  cap.position.y = 1.92;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), new THREE.MeshLambertMaterial({ color: 0x141c30 }));
  legL.position.set(-0.16, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), uniform);
  armL.position.set(-0.44, 1.05, 0);
  const armR = armL.clone(); armR.position.x = 0.44;
  g.add(body, head, cap, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, isCop: true };
  return g;
}

export class Police {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game; // for callbacks: onPlayerDamage, audio, toast
    this.stars = 0;
    this.heat = 0;
    this.cars = [];
    this.cops = [];
    this.spawnTimer = 0;
    this.decayTimer = 0;
    this.flashTimer = 0;
    this.shootTimer = 0;
  }

  addHeat(n, reason) {
    if (this.stars >= MAX_STARS) return;
    this.heat += n;
    const next = Math.min(MAX_STARS, Math.floor(this.heat / 2) + (this.stars === 0 && n > 0 ? 1 : 0));
    if (next > this.stars) {
      this.stars = next;
      this.game.audio.wantedUp();
      this.game.hud.flashWanted();
      if (reason) this.game.hud.toast(`${reason} — wanted level ${this.stars}`);
    }
  }

  setStars(n) {
    this.stars = clamp(n, 0, MAX_STARS);
    this.heat = this.stars * 2;
    if (n > 0) this.game.audio.wantedUp();
  }

  clearAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cars = []; this.cops = [];
    this.stars = 0; this.heat = 0;
  }

  spawnPoliceCar(px, pz) {
    const spot = this.city.randomRoadPoint();
    // Prefer a road point 40-70 units from the player so the chase arrives fast.
    let x = spot.x, z = spot.z;
    for (let i = 0; i < 8; i++) {
      const s = this.city.randomRoadPoint();
      const d = dist2D(px, pz, s.x, s.z);
      if (d > 35 && d < 80) { x = s.x; z = s.z; break; }
    }
    const mesh = makeCarMesh(0x1a1a22, true);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, 0, 0x1a1a22, true);
    car.speed = 10;
    car.stuckTimer = 0;
    this.cars.push(car);
    return car;
  }

  spawnCop(px, pz) {
    const a = rand(Math.PI * 2);
    const x = px + Math.sin(a) * rand(18, 30);
    const z = pz + Math.cos(a) * rand(18, 30);
    const mesh = makeCopMesh();
    this.scene.add(mesh);
    const cop = { mesh, x, z, heading: a, speed: 0, phase: rand(10), punchTimer: 0, shootTimer: rand(0.5, 1.5) };
    mesh.position.set(x, 0, z);
    this.cops.push(cop);
    return cop;
  }

  update(dt, player) {
    const px = player.x, pz = player.z;
    // Siren follows the wanted level.
    this.game.audio.setSiren(this.stars > 0 && this.cars.length > 0);
    // Spawn to match the wanted level.
    this.spawnTimer -= dt;
    const wantCars = Math.min(this.stars, 4);
    const wantCops = this.stars >= 2 ? Math.min(this.stars - 1, 3) : 0;
    if (this.spawnTimer <= 0) {
      if (this.stars > 0 && this.cars.length < wantCars) { this.spawnPoliceCar(px, pz); this.spawnTimer = 1.2; }
      else if (this.stars > 0 && this.cops.length < wantCops) { this.spawnCop(px, pz); this.spawnTimer = 1.2; }
      else this.spawnTimer = 0.8;
    }
    // Decay: no police near the player for a while drops a star.
    let nearest = Infinity;
    for (const c of this.cars) nearest = Math.min(nearest, dist2D(px, pz, c.x, c.z));
    for (const c of this.cops) nearest = Math.min(nearest, dist2D(px, pz, c.x, c.z));
    if (this.stars > 0) {
      if (nearest > 70) {
        this.decayTimer += dt;
        if (this.decayTimer > 9) { this.stars--; this.heat = this.stars * 2; this.decayTimer = 0; this.game.hud.toast(`Heat cooling off — wanted level ${this.stars}`); }
      } else this.decayTimer = 0;
    }
    // Police cars chase and ram.
    for (const car of [...this.cars]) {
      const d = dist2D(px, pz, car.x, car.z);
      if (this.stars === 0 || d > 220) {
        this.scene.remove(car.mesh);
        this.cars.splice(this.cars.indexOf(car), 1);
        continue;
      }
      const wantHeading = Math.atan2(px - car.x, pz - car.z);
      const diff = angleDiff(car.heading, wantHeading);
      car.heading += clamp(diff, -2.6 * dt, 2.6 * dt);
      const targetSpeed = clamp(d * 0.55, 12, 34);
      car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const p = { x: car.x, z: car.z };
      if (collideCircle(p, 2.1, this.city.colliders)) { car.x = p.x; car.z = p.z; car.speed *= 0.5; }
      this.city.clampToWorld(p, 4);
      car.x = p.x; car.z = p.z;
      car.sync();
      // Ram the player's car / knock the player down.
      if (d < 4.6) {
        if (player.inCar && player.car) {
          player.car.speed *= 0.82;
          const push = 3.2;
          player.car.x += Math.sin(car.heading) * push * dt * 4;
          player.car.z += Math.cos(car.heading) * push * dt * 4;
          if (Math.abs(player.car.speed) > 6 && Math.random() < dt * 2) this.game.audio.crash();
        } else if (Math.random() < dt * 1.2) {
          this.game.damagePlayer(6, 'police ram');
        }
      }
      // Stuck? Teleport back onto a road near the player.
      if (Math.abs(car.speed) < 2) car.stuckTimer += dt; else car.stuckTimer = 0;
      if (car.stuckTimer > 4) {
        const s = this.city.randomRoadPoint();
        car.x = s.x; car.z = s.z; car.speed = 12; car.stuckTimer = 0;
      }
      // Flash the light bar.
      this.flashTimer += dt;
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const on = Math.floor(this.flashTimer * 4) % 2 === 0;
        bar.userData.red.material.color.setHex(on ? 0xff2020 : 0x550000);
        bar.userData.blue.material.color.setHex(on ? 0x101040 : 0x2040ff);
      }
    }
    // Foot cops chase on foot.
    for (const cop of [...this.cops]) {
      const d = dist2D(px, pz, cop.x, cop.z);
      if (this.stars === 0 || d > 160) {
        this.scene.remove(cop.mesh);
        this.cops.splice(this.cops.indexOf(cop), 1);
        continue;
      }
      const wantHeading = Math.atan2(px - cop.x, pz - cop.z);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += clamp(diff, -3.5 * dt, 3.5 * dt);
      const speed = d > 26 ? 6.4 : 5.2;
      cop.x += Math.sin(cop.heading) * speed * dt;
      cop.z += Math.cos(cop.heading) * speed * dt;
      const p = { x: cop.x, z: cop.z };
      collideCircle(p, 0.5, this.city.colliders);
      cop.x = p.x; cop.z = p.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.phase += dt * speed * 3;
      const sw = Math.sin(cop.phase) * 0.5;
      cop.mesh.userData.legL.rotation.x = sw;
      cop.mesh.userData.legR.rotation.x = -sw;
      // Melee at close range; shots at range when the heat is high.
      cop.punchTimer -= dt;
      cop.shootTimer -= dt;
      if (d < 1.8 && cop.punchTimer <= 0) {
        cop.punchTimer = 1.1;
        this.game.damagePlayer(8, 'cop baton');
        this.game.audio.thud();
      } else if (this.stars >= 3 && d > 8 && d < 30 && cop.shootTimer <= 0) {
        cop.shootTimer = rand(1.2, 2.0);
        this.game.audio.gunshot();
        if (Math.random() < 0.45) this.game.damagePlayer(5, 'police fire');
        this.game.combat.spawnTracer(cop.x, 1.4, cop.z, px, 1.3, pz);
      }
    }
  }
}
