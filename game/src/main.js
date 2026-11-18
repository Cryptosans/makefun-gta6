// main.js — Solara Bay entry point: renderer, loop, camera, crime/wanted
// wiring, mission wiring, shooting, stealing, pause, save, debug handle.
import * as THREE from 'three';
import { buildCity, ROAD_COORDS } from './city.js';
import { Car, spawnParkedCars } from './vehicles.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { CombatSystem } from './combat.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { clamp, dist2d, fmtCash, normAngle } from './utils.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0x87b5d9, 120, 260);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 12, -18);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a3a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.position.set(60, 90, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 260;
scene.add(sun);

// --- World systems.
const city = buildCity(scene);
const colliders = city.colliders;
const player = new Player(scene, colliders);
const traffic = new TrafficSystem(scene);
const peds = new PedestrianSystem(scene);
const police = new PoliceSystem(scene, colliders);
const combat = new CombatSystem(scene);
const parkedCars = spawnParkedCars(scene);
const hud = new HUD();
const audio = new AudioEngine();
const input = new Input(canvas);

// --- Mission beacon: glowing cylinder + light pillar in the world.
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 14, 20, 1, true), beaconMat);
beaconMesh.position.set(20, 7, 3.5);
scene.add(beaconMesh);
const beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 32), new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.set(20, 0.15, 3.5);
scene.add(beaconRing);

// --- Game state.
let started = false;
let paused = false;
let clockMinutes = 9 * 60 + 30; // 09:30
let saveTimer = 0;
let toastQueue = [];
let camDistance = 11;
let camHeight = 5.5;
let camPitch = 0.32;
let deathHandled = false;

const missions = new MissionManager({
  onStart: (def) => {
    hud.toast('Mission started: ' + def.name + ' — ' + def.briefing, 5000);
    audio.missionStart();
    police.setWanted(0);
  },
  onStage: (stage) => { hud.toast(stage.label, 4000); },
  onComplete: (def, reward) => {
    player.cash += reward;
    hud.toast('Mission complete: ' + def.name + ' — +' + fmtCash(reward), 5000);
    audio.missionComplete();
    saveNow();
    if (missions.index + 1 < MISSION_DEFS.length) {
      hud.toast('Next mission: ' + MISSION_DEFS[missions.index + 1].name + ' — press M to start', 5000);
    } else {
      hud.toast('You are the King of Solara. The city is yours.', 8000);
    }
  },
  onFail: (def, reason) => {
    hud.toast('Mission failed: ' + def.name + ' — ' + reason + '. Press R to retry.', 5000);
    audio.missionFail();
  },
  onSpawnEnemies: (stage) => {
    combat.spawnEnemies(stage.spawn || 'viper', stage.spawnAt.x, stage.spawnAt.z, stage.count);
    hud.toast(stage.count + ' hostiles at the marker. Weapons free.', 4000);
  },
  onKillProgress: (done, total) => { hud.toast('Target down (' + done + '/' + total + ')', 2000); },
});

function saveNow() {
  saveGame({
    cash: player.cash,
    missionIndex: missions.index,
    health: player.health,
    playerPos: { x: player.x, z: player.z },
    playerHeading: player.heading,
    clockMinutes,
  });
}

function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    player.cash = save.cash || 0;
    missions.index = Math.min(save.missionIndex || 0, MISSION_DEFS.length - 1);
    player.spawn(save.playerPos ? save.playerPos.x : 0, save.playerPos ? save.playerPos.z : 8, save.playerHeading ?? Math.PI);
    clockMinutes = save.clockMinutes || clockMinutes;
    hud.toast('Welcome back, Rico. Mission: ' + MISSION_DEFS[missions.index].name + ' — press M.', 4500);
  } else {
    player.cash = 0;
    missions.index = 0;
    player.spawn(0, 8, Math.PI);
    hud.toast('Rico Vega, wheelman fresh out of the Solara docks. Press M to start Hot Wheels.', 5000);
  }
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  started = true;
  audio.ensure();
}

function onPlayerHit(amount, cause) {
  if (!started || paused || player.dead) return;
  if (amount > 0) {
    player.damage(amount);
    audio.hurt();
    hud.toast('Hit! ' + cause + ' (-' + amount + ' HP)', 1800);
  }
}

function nearestStealableCar(maxDist = 4.5) {
  let best = null, bd = maxDist;
  const all = parkedCars.concat(traffic.cars.map((t) => t.car), police.cruisers);
  for (const c of all) {
    if (c.isPlayer) continue;
    const d = dist2d(c.x, c.z, player.x, player.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function stealCar(car) {
  // If the car is a traffic car, pull it out of traffic; if police, take it.
  const ti = traffic.cars.findIndex((t) => t.car === car);
  if (ti >= 0) traffic.cars.splice(ti, 1);
  const pi = police.cruisers.indexOf(car);
  if (pi >= 0) police.cruisers.splice(pi, 1);
  player.enterCar(car);
  audio.carDoor();
  police.addHeat(car.isPolice ? 25 : 12);
  peds.scareNear(player.x, player.z, 24);
  hud.toast('Stole the ' + car.name + (car.isPolice ? ' — the cops saw that!' : ''), 3000);
}

function shootPlayerWeapon() {
  if (player.inCar || player.dead) return;
  audio.ensure();
  const from = { x: player.x, y: 1.5, z: player.z };
  const dir = { x: Math.sin(player.camYaw), y: 0, z: Math.cos(player.camYaw) };
  const hit = combat.shoot(from, dir, (enemy, killed) => {
    if (killed) {
      // Cash drops are handled by combat pickups; kills also count for missions.
      missions.registerKill();
    }
  });
  audio.gunshot();
  police.addHeat(4);
  peds.scareNear(player.x, player.z, 30);
  if (hit) hud.toast('Hit ' + hit.kind + ' — ' + Math.max(0, Math.round(hit.health)) + ' HP left', 1200);
}

// --- Start screen wiring.
const newBtn = document.getElementById('btn-new');
const contBtn = document.getElementById('btn-continue');
if (hasSave()) {
  contBtn.disabled = false;
  const meta = loadSave();
  if (meta) contBtn.textContent = 'Continue — ' + fmtCash(meta.cash) + ' · Mission ' + (meta.missionIndex + 1);
} else {
  contBtn.disabled = true;
}
newBtn.addEventListener('click', () => { clearSave(); startGame(false); });
contBtn.addEventListener('click', () => startGame(true));
document.getElementById('btn-how').addEventListener('click', () => {
  document.getElementById('howto').classList.toggle('hidden');
});
// Autostart for automated verification / screenshots (?autostart=1).
const params = new URLSearchParams(window.location.search);
if (params.get('autostart') === '1') {
  startGame(false);
  if (params.get('mission') === '1') setTimeout(() => { if (missions.status === 'idle') missions.start(0); }, 400);
}

// --- Pause.
function setPaused(v) {
  paused = v;
  document.getElementById('pause-screen').classList.toggle('hidden', !v);
  if (!v && document.pointerLockElement) document.exitPointerLock();
}

// --- Main loop.
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  if (started && !paused) update(dt);
  // Camera + render always run so the start screen has a live backdrop.
  updateCamera(dt);
  updateBeacon(dt);
  renderer.render(scene, camera);
  input.endFrame();
}

function update(dt) {
  // Clock: ~1 game hour per 40 real seconds.
  clockMinutes = (clockMinutes + dt * 1.5) % (24 * 60);
  // Day/night tint on the sun.
  const hour = clockMinutes / 60;
  const dayFactor = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0.25, 1);
  sun.intensity = 0.5 + 1.3 * dayFactor;

  // Mouse look.
  const md = input.takeMouseDelta();
  if (input.locked) {
    player.camYaw -= md.x * 0.0032;
    camPitch = clamp(camPitch + md.y * 0.002, 0.05, 0.9);
  }
  if (input.isDown('arrowleft')) player.camYaw += 1.9 * dt;
  if (input.isDown('arrowright')) player.camYaw -= 1.9 * dt;

  // --- Driving / walking.
  const fwd = (input.isDown('w') || input.isDown('arrowup') ? 1 : 0) - (input.isDown('s') || input.isDown('arrowdown') ? 1 : 0);
  const strafe = (input.isDown('d') ? 1 : 0) - (input.isDown('a') ? 1 : 0);
  const running = input.isDown('shift');
  if (player.inCar && player.car) {
    const handbrake = input.isDown(' ');
    player.car.drive(fwd, strafe, handbrake, dt, colliders);
    player.x = player.car.x; player.z = player.car.z;
    player.heading = player.car.heading;
    player.camYaw = player.car.heading;
    audio.setEngine(Math.abs(player.car.speed) / player.car.maxSpeed, true);
    if (handbrake && Math.abs(player.car.speed) > 12) audio.skid();
  } else {
    player.walk(fwd, strafe, running, dt);
    audio.setEngine(0, false);
  }

  // --- Enter / exit / steal car (E).
  if (input.wasPressed('e')) {
    audio.ensure();
    if (player.inCar) {
      player.exitCar();
      audio.carDoor();
    } else {
      const car = nearestStealableCar(4.5);
      if (car) stealCar(car);
    }
  }

  // --- Shooting (mouse click, on foot only).
  if (input.consumeMouseClick()) {
    if (!started) { /* start screen handles its own buttons */ }
    else if (!player.inCar && !player.dead) shootPlayerWeapon();
  }
  if (input.wasPressed('r') && input.isDown('r')) { /* fallthrough */ }
  if (input.wasPressed('r')) {
    if (missions.status === 'failed') missions.retry();
    else combat.reload();
  }
  if (input.wasPressed('m')) {
    if (missions.status === 'idle') missions.start(missions.index);
    else if (missions.status === 'active') hud.toast('Mission in progress: ' + missions.def.name, 2500);
    else if (missions.status === 'done') hud.toast('All missions complete. Free roam, Rico.', 3000);
  }
  if (input.wasPressed('escape')) setPaused(!paused);
  if (input.wasPressed('p')) setPaused(!paused);

  // --- Systems.
  traffic.update(dt, player.inCar ? player.car : null);
  peds.update(dt);
  police._onCopShot = (sx, sz, tx, tz) => combat.enemyShoot(sx, sz, tx, tz, onPlayerHit);
  police.update(dt, player, onPlayerHit, audio);
  combat.update(dt, player.x, player.z, {
    onPlayerHit,
    onEnemyKilled: () => { /* mission kill counting happens in shootPlayerWeapon via registerKill on kill; also count here for safety */ },
    onPickup: (amt) => { player.cash += amt; audio.cash(); hud.toast('Picked up ' + fmtCash(amt), 1500); },
  });
  // Kills that happen via the kill callback above are counted in shoot; but
  // enemies can also die from... only shooting, so counting is centralised there.
  // Mission timer / stage checks.
  missions.update(dt, {
    playerX: player.x, playerZ: player.z,
    inCar: player.inCar,
    carId: player.car ? player.car.id : null,
  });

  // --- Death / respawn.
  if (player.dead) {
    player.deadTimer -= dt;
    if (!deathHandled) {
      deathHandled = true;
      hud.toast('Wasted. The crew patches you up — $100 hospital bill.', 4500);
      police.clearAll();
      combat.clearEnemies();
    }
    if (player.deadTimer <= 0) {
      player.cash = Math.max(0, player.cash - 100);
      if (player.inCar) player.exitCar();
      player.spawn(0, 8, Math.PI);
      deathHandled = false;
      if (missions.status === 'active') missions.fail('Rico went down');
    }
  } else {
    // Slow health regen out of combat.
    if (police.wanted === 0) player.heal(dt * 1.5);
  }

  // --- Autosave.
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; saveNow(); }

  // --- HUD + minimap.
  const beacon = missions.beacon();
  const beaconAngle = beacon ? Math.atan2(beacon.x - player.x, beacon.z - player.z) : null;
  const beaconDist = beacon ? dist2d(player.x, player.z, beacon.x, beacon.z) : null;
  let prompt = '';
  if (!player.inCar && !player.dead) {
    const car = nearestStealableCar(4.5);
    if (car) prompt = '[E] Steal ' + car.name + (car.isPolice ? ' (police cruiser)' : '');
    else if (beacon && beaconDist < 10) prompt = 'Reach the marker';
  } else if (player.inCar) {
    prompt = '[E] Exit car · [Space] Handbrake';
  }
  hud.update({
    cash: player.cash,
    health: player.health,
    wanted: police.wanted,
    clockMinutes,
    objective: missions.objectiveText(),
    missionName: missions.def ? missions.def.name : 'Solara Bay',
    timeLeft: missions.status === 'active' ? missions.timeLeft : 0,
    ammo: combat.ammo,
    reloading: combat.reloadTimer > 0,
    prompt,
    beaconAngle,
    beaconDist,
  });
  hud.drawMinimap({
    playerX: player.x, playerZ: player.z,
    playerHeading: player.inCar && player.car ? player.car.heading : player.camYaw,
    beacon,
    traffic: traffic.cars.map((t) => ({ x: t.car.x, z: t.car.z })),
    police: police.cruisers.map((c) => ({ x: c.x, z: c.z })),
    enemies: combat.enemies.map((e) => ({ x: e.x, z: e.z })),
  });

  // --- Debug handle for verification only.
  window.__solara = {
    missionIndex: missions.index,
    missionStatus: missions.status,
    cash: player.cash,
    wanted: police.wanted,
    playerPos: { x: player.x, z: player.z },
    playerHeading: player.heading,
    inCar: player.inCar,
    carId: player.car ? player.car.id : null,
    health: player.health,
    timeLeft: missions.status === 'active' ? missions.timeLeft : 0,
    started,
    paused,
  };
}

function updateCamera(dt) {
  const anchor = player.cameraAnchor();
  const dist = player.inCar ? camDistance + 2 : camDistance;
  const height = player.inCar ? camHeight + 1 : camHeight;
  const yaw = player.inCar ? player.car.heading : player.camYaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const tx = anchor.x - fx * dist;
  const tz = anchor.z - fz * dist;
  const ty = height;
  const k = 1 - Math.pow(0.001, dt); // smooth follow
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.lookAt(anchor.x + fx * 6, 1.6, anchor.z + fz * 6);
}

function updateBeacon(dt) {
  const b = missions.beacon();
  const visible = started && missions.status === 'active' && !!b;
  beaconMesh.visible = visible;
  beaconRing.visible = visible;
  if (visible) {
    beaconMesh.position.set(b.x, 7, b.z);
    beaconRing.position.set(b.x, 0.15, b.z);
    beaconMesh.rotation.y += dt * 0.8;
    const pulse = 0.45 + Math.sin(elapsed * 4) * 0.15;
    beaconMat.opacity = pulse;
    beaconRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.15);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('btn-resume').addEventListener('click', () => setPaused(false));
document.getElementById('btn-restart').addEventListener('click', () => {
  clearSave();
  setPaused(false);
  player.cash = 0;
  missions.index = 0;
  missions.status = 'idle';
  police.clearAll();
  combat.clearEnemies();
  player.spawn(0, 8, Math.PI);
});

// Expose the debug handle immediately (before first frame) so verifiers
// can poll it even while the start screen is up.
window.__solara = {
  missionIndex: missions.index,
  missionStatus: missions.status,
  cash: player.cash,
  wanted: police.wanted,
  playerPos: { x: player.x, z: player.z },
  playerHeading: player.heading,
  inCar: false,
  carId: null,
  health: player.health,
  timeLeft: 0,
  started: false,
  paused: false,
};

animate();
