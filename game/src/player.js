// Solara Bay — the player on foot: a blocky Solara local called Rio Vela,
// with walk/run, heading that follows movement, and a punch-ready pose.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerpAngle, collideBuildings, clampToWorld } from './utils.js';

const SKIN = 0xc98d64;
const SHIRT = 0xff5a7a;
const PANTS = 0x2e4a7d;
const HAIR = 0x1a1210;

function limb(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  return m;
}

/** Build Rio's mesh: torso, head, arms and legs as simple boxes. */
export function buildPlayerMesh() {
  const g = new THREE.Group();
  g.name = 'RioVela';
  const torso = limb(1.1, 1.3, 0.55, SHIRT, 0, 1.35, 0);
  const head = limb(0.62, 0.62, 0.62, SKIN, 0, 2.35, 0);
  const hair = limb(0.66, 0.22, 0.66, HAIR, 0, 2.7, 0);
  const armL = limb(0.32, 1.1, 0.32, SKIN, -0.72, 1.35, 0);
  const armR = limb(0.32, 1.1, 0.32, SKIN, 0.72, 1.35, 0);
  const legL = limb(0.42, 0.95, 0.42, PANTS, -0.28, 0.48, 0);
  const legR = limb(0.42, 0.95, 0.42, PANTS, 0.28, 0.48, 0);
  armL.name = 'armL'; armR.name = 'armR';
  legL.name = 'legL'; legR.name = 'legR';
  g.add(torso, head, hair, armL, armR, legL, legR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export class Player {
  constructor(scene, spawn) {
    this.mesh = buildPlayerMesh();
    this.mesh.position.set(spawn.x, 0, spawn.z);
    this.heading = spawn.heading;
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position; // Vector3 alias, y stays 0
    this.speed = 0;
    this.health = CONFIG.player.maxHealth;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchAnim = 0;
    this.hurtFlash = 0;
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.heading = spawn.heading;
    this.mesh.rotation.y = this.heading;
    this.health = CONFIG.player.maxHealth;
    this.speed = 0;
  }

  /** Move with the camera-relative axis; returns true while moving. */
  update(dt, axis, camYaw, colliders, running) {
    if (this.punchTimer > 0) this.punchTimer -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    const moving = axis.x !== 0 || axis.y !== 0;
    const targetSpeed = moving
      ? (running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed) : 0;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 8, dt);
    if (moving && this.speed > 0.5) {
      // Camera-relative movement direction.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const mx = (axis.x * cos - axis.y * sin);
      const mz = (axis.x * sin + axis.y * cos);
      const len = Math.hypot(mx, mz) || 1;
      const nx = mx / len;
      const nz = mz / len;
      const targetHeading = Math.atan2(nx, nz);
      this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, dt * CONFIG.player.turnSpeed));
      this.mesh.rotation.y = this.heading;
      this.pos.x += nx * this.speed * dt;
      this.pos.z += nz * this.speed * dt;
      this.walkPhase += dt * this.speed * 1.6;
    }
    collideBuildings(this.pos, CONFIG.player.radius, colliders);
    clampToWorld(this.pos, CONFIG.world.halfSize - 2);
    // Walk-cycle swing; punch overrides the right arm.
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const legL = this.mesh.getObjectByName('legL');
    const legR = this.mesh.getObjectByName('legR');
    const armL = this.mesh.getObjectByName('armL');
    const armR = this.mesh.getObjectByName('armR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing * 0.8;
    if (armR) {
      armR.rotation.x = this.punchAnim > 0 ? -1.5 : swing * 0.8;
      if (this.punchAnim > 0) this.punchAnim -= dt * 4;
    }
    return moving;
  }

  startPunch() {
    if (this.punchTimer > 0) return false;
    this.punchTimer = CONFIG.player.punchCooldown;
    this.punchAnim = 1;
    return true;
  }

  takeDamage(amount) {
    this.health = clamp(this.health - amount, 0, CONFIG.player.maxHealth);
    this.hurtFlash = 0.35;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, CONFIG.player.maxHealth);
  }
}
