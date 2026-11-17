// Solara Bay — bootstrap and game loop. Builds the world, owns the camera,
// routes input to the right system, and keeps the HUD honest. Everything
// the other modules need meets here; nothing else reaches into the DOM.
import * as THREE from 'three';
import { CONFIG, ROAD_LINES, PLACES } from './config.js';
import { buildCity, parkedCarSpots, trafficLoops } from './city.js';
import { Player } from './player.js';
import { spawnParkedCars, nearestCar } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions, MISSION_DEFS } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { SaveSys } from './save.js';
import { clamp, lerpAngle, dist2D, fmtMoney, collideBuildings } from './utils.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d6);
scene.fog = new THREE.Fog(0x9fc3d8, 180, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a3a, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(180, 260, 120);
scene.add(sun);

// --- world ---------------------------------------------------------------
const city = buildCity(scene);
const player = new Player(scene, PLACES.spawn);
const parkedCars = spawnParkedCars(scene, parkedCarSpots());
const traffic = new Traffic(scene, trafficLoops());
const pedestrians = new Pedestrians(scene);
const police = new Police(scene);
const combat = new Combat(scene);
const audio = new AudioSys();
const input = new Input(canvas);
input.onFirstGesture = () => audio.init();

// --- state ---------------------------------------------------------------
const state = {
  started: false,
  paused: false,
  over: false, // wasted / busted overlay up
  cash: 250,
  mode: 'foot', // foot | car
  drivenCar: null,
  time: 0,
  camYaw: Math.PI,
  camPitch: 0.34,
  camDist: CONFIG.camera.distance,
  lastDrag: -10,
  lastObjective: '',
  autosaveTimer: 0,
  pedHitCooldown: 0,
  menuAngle: 0,
};

const hud = new HUD({
  onNewGame: () => startGame(false),
  onContinue: () => startGame(true),
  onResume: () => setPaused(false),
  onSave: () => {
    if (saveGame()) hud.toast('Game saved.');
    else hud.toast('Save failed — browser storage is unavailable.');
  },
  onRestart: () => {
    SaveSys.clear();
    resetWorld();
    startGame(false);
  },
  onQuitToTitle: () => {
    setPaused(false);
    state.started = false;
    state.over = false;
    hud.showStart(SaveSys.hasSave());
  },
  onRespawn: () => {
    hud.hideWasted();
    state.over = false;
    state.paused = false;
  },
  onStartMission: (id) => {
    setPaused(false);
    const def = missions.start(id);
    if (def) hud.toast(`Mission started: ${def.title}`);
  },
});

const missions = new Missions(scene, {
  onStart: (def) => {
    audio.missionStart();
    hud.setObjective(`MISSION ${def.id} — ${def.title}`, def.objective);
    hud.toast(def.briefing, 5200);
    state.lastObjective = '';
  },
  onComplete: (def) => {
    state.cash += def.reward;
    audio.missionComplete();
    audio.cash();
    hud.banner('MISSION COMPLETE', `${def.title} — ${fmtMoney(def.reward)} earned`);
    hud.toast(missions.isStoryDone
      ? 'Story complete! Rio owns Solara Bay. Free roam, or start over from the pause menu.'
      : `Next mission: ${missions.nextAvailable()?.title ?? '—'}`, 5200);
    saveGame();
  },
  onFail: (def, why) => {
    audio.busted();
    hud.toast(`Mission failed: ${def.title} — ${why} Try again at its pink marker.`, 5200);
  },
  onObjective: (text) => {
    if (missions.active) hud.setObjective(`MISSION ${missions.active.def.id} — ${missions.active.def.title}`, text);
  },
  spawnThugs: (at, n) => combat.spawnThugs(at, n),
  clearThugs: () => combat.clearThugs(),
  spawnPickups: (at, n) => combat.spawnPickups(at, n),
  clearPickups: () => combat.clearPickups(),
  setWanted: (n) => police.addWanted(n, 'mission heat'),
  blip: () => audio.blip(),
  cash: () => audio.cash(),
});

// --- helpers -------------------------------------------------------------
function saveGame() {
  return SaveSys.save({
    cash: state.cash,
    completed: missions.completed,
    playerX: player.pos.x,
    playerZ: player.pos.z,
    heading: player.heading,
    health: player.health,
    weapon: combat.weapon,
    ammo: combat.ammo,
    reserve: combat.reserve,
  });
}

function resetWorld() {
  state.cash = 250;
  state.mode = 'foot';
  state.drivenCar = null;
  state.time = 0;
  state.over = false;
  player.reset(PLACES.spawn);
  player.mesh.visible = true;
  missions.completed.clear();
  missions.abort();
  police.clearWanted();
  combat.weapon = 'fists';
  combat.ammo = CONFIG.combat.pistolAmmo;
  combat.reserve = CONFIG.combat.pistolReserve;
  hud.setObjective('FREE ROAM', 'Find a pink marker and press E to start a mission.');
}

function startGame(fromSave) {
  resetWorld();
  if (fromSave) {
    const s = SaveSys.load();
    if (s) {
      state.cash = s.cash;
      for (const id of s.completed) missions.completed.add(id);
      player.pos.set(s.player.x, 0, s.player.z);
      player.heading = s.heading;
      player.mesh.rotation.y = s.heading;
      player.health = s.player.health;
      combat.weapon = s.weapon === 'pistol' ? 'pistol' : 'fists';
      combat.ammo = s.ammo;
      combat.reserve = s.reserve;
      hud.toast('Welcome back to Solara Bay.');
    }
  } else {
    hud.toast('Welcome to Solara Bay. Steal a car — the pink marker is your first job.');
  }
  audio.init();
  state.started = true;
  state.paused = false;
  hud.hideStart();
  hud.hidePause();
  hud.hideWasted();
}

function setPaused(on) {
  if (!state.started || state.over) return;
  state.paused = on;
  if (on) {
    hud.showPause(MISSION_DEFS.map((d) => ({
      id: d.id, title: d.title, reward: d.reward,
      done: missions.completed.has(d.id),
      active: missions.active?.def.id === d.id,
    })));
  } else {
    hud.hidePause();
  }
}

function enterCar(car, stolen) {
  state.mode = 'car';
  state.drivenCar = car;
  car.kind = 'driven';
  player.mesh.visible = false;
  audio.steal();
  hud.toast(stolen ? 'Car stolen! The PD has been tipped off.' : 'You slide behind the wheel.');
}

function exitCar() {
  const car = state.drivenCar;
  if (!car) return;
  state.mode = 'foot';
  state.drivenCar = null;
  car.kind = 'parked';
  car.speed = 0;
  player.mesh.visible = true;
  player.pos.set(
    car.pos.x + Math.cos(car.heading) * 2.6,
    0,
    car.pos.z - Math.sin(car.heading) * 2.6,
  );
  player.heading = car.heading;
  player.mesh.rotation.y = player.heading;
}

function stealOrEnter() {
  const allCars = [...parkedCars, ...traffic.cars];
  const car = nearestCar(allCars, player.pos.x, player.pos.z, 4);
  if (!car) return false;
  if (car.kind === 'traffic') {
    // Yank the driver out: the car leaves traffic and becomes yours.
    const i = traffic.cars.indexOf(car);
    if (i >= 0) traffic.cars.splice(i, 1);
    parkedCars.push(car);
    police.addWanted(2, 'carjacking');
    car.stolen = true;
    enterCar(car, true);
  } else if (car.stolen) {
    enterCar(car, false);
  } else {
    car.stolen = true;
    police.addWanted(CONFIG.car.stealWanted, 'car theft');
    enterCar(car, true);
  }
  return true;
}

function attack() {
  if (state.mode !== 'foot' || !state.started || state.paused || state.over) return;
  if (combat.weapon === 'fists') {
    if (!player.startPunch()) return;
    audio.punch();
    const hit = combat.punch(player, police, pedestrians);
    if (hit?.kind === 'thug') {
      audio.blip();
      if (combat.thugsLeft === 0) hud.toast('All Vipers down.');
    } else if (hit?.kind === 'ped') {
      hud.toast('Assault! Wanted level up.');
    }
  } else {
    const res = combat.shoot(player, police, pedestrians);
    if (res?.kind === 'empty') {
      hud.toast('Out of ammo — press R to reload.');
    } else if (res) {
      audio.shot();
      if (res.kind === 'thug' && combat.thugsLeft === 0) hud.toast('All Vipers down.');
      if (res.kind === 'ped' || res.kind === 'cop') hud.toast('Shots fired! Wanted level up.');
    }
  }
}

function wasted(title, sub) {
  if (state.over) return;
  state.over = true;
  state.paused = true;
  if (state.mode === 'car') exitCar();
  missions.abort();
  police.respawnPlayer(player, state);
  state.cash = Math.max(0, state.cash - 100);
  audio.busted();
  hud.showWasted(title, sub);
}

// Click (not drag) on the canvas attacks.
let mouseDownPos = null;
canvas.addEventListener('mousedown', (e) => { mouseDownPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('mouseup', (e) => {
  if (!mouseDownPos) return;
  const moved = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
  mouseDownPos = null;
  if (moved < 6) attack();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- main loop -----------------------------------------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let menuOrbit = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!state.started) {
    // Slow orbit over the bay behind the title screen.
    menuOrbit += dt * 0.05;
    camera.position.set(Math.sin(menuOrbit) * 200, 95, Math.cos(menuOrbit) * 200);
    camera.lookAt(0, 8, 40);
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (!state.paused) {
    state.time += dt;
    if (state.pedHitCooldown > 0) state.pedHitCooldown -= dt;

    // --- input edges ---
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) setPaused(true);
    if (input.wasPressed('KeyQ')) {
      hud.toast(`Weapon: ${combat.switchWeapon().toUpperCase()}`);
      audio.blip();
    }
    if (input.wasPressed('KeyR') && combat.reload()) {
      hud.toast('Reloaded.');
      audio.blip();
    }
    if (input.wasPressed('KeyN')) {
      hud.toast(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (input.wasPressed('KeyF')) attack();
    if (input.wasPressed('KeyE')) {
      if (state.mode === 'car') exitCar();
      else if (!stealOrEnter()) {
        const def = missions.startAt(player.pos.x, player.pos.z);
        if (def) hud.toast(`Mission started: ${def.title}`);
      }
    }

    const axis = input.moveAxis();
    const cam = input.consumeCamera();
    if (cam.yaw !== 0 || cam.pitch !== 0) state.lastDrag = state.time;
    state.camYaw -= cam.yaw * 0.005;
    state.camPitch = clamp(state.camPitch + cam.pitch * 0.003, 0.08, 1.05);
    state.camDist = clamp(state.camDist + cam.wheel * 0.01, CONFIG.camera.minDistance, CONFIG.camera.maxDistance);

    // --- movement ---
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    let speedNorm = 0;
    if (state.mode === 'foot') {
      const moving = player.update(dt, axis, state.camYaw, city.colliders, running);
      if (moving) {
        // Camera swings behind the direction of travel.
        if (state.time - state.lastDrag > 2.5) {
          state.camYaw = lerpAngle(state.camYaw, player.heading + Math.PI, Math.min(1, dt * 1.6));
        }
        speedNorm = player.speed / CONFIG.player.runSpeed;
      }
    } else {
      const car = state.drivenCar;
      const crashed = car.drive(dt, axis.y, -axis.x, city.colliders,
        [...traffic.cars, ...parkedCars, ...police.cars]);
      if (crashed) {
        audio.crash();
        hud.flashDamage();
        if (player.takeDamage(4)) {
          wasted('WASTED', 'You crashed too hard. You wake up at St. Solara Hospital, $100 lighter.');
        }
      }
      if (state.time - state.lastDrag > 2.5) {
        state.camYaw = lerpAngle(state.camYaw, car.heading + Math.PI, Math.min(1, dt * 2.2));
      }
      speedNorm = Math.abs(car.speed) / CONFIG.car.maxSpeed;
      // Running over a pedestrian at speed is a crime.
      if (Math.abs(car.speed) > 6 && state.pedHitCooldown <= 0) {
        for (const p of pedestrians.peds) {
          if (p.down) continue;
          if (dist2D(car.pos.x, car.pos.z, p.pos.x, p.pos.z) < 2.4) {
            p.down = true;
            p.downTimer = 15;
            p.mesh.visible = false;
            police.addWanted(1, 'hit and run');
            state.pedHitCooldown = 3;
            audio.crash();
            pedestrians.scare(car.pos.x, car.pos.z, 18);
            hud.toast('Hit and run! Wanted level up.');
            break;
          }
        }
      }
      if (car.health <= 0) {
        const wreck = car;
        const i = parkedCars.indexOf(wreck);
        if (i >= 0) parkedCars.splice(i, 1);
        scene.remove(wreck.mesh);
        exitCar();
        hud.toast('Your car was wrecked by the PD.');
        audio.crash();
      }
    }

    // --- world systems ---
    traffic.update(dt);
    pedestrians.update(dt, state.mode === 'car' ? state.drivenCar.pos : player.pos,
      state.mode === 'car' ? Math.abs(state.drivenCar.speed) : player.speed);
    const policeResult = police.update(dt, player, state.mode === 'car' ? state.drivenCar : null);
    for (const c of police.cars) {
      // Cruisers respect buildings too.
      collideBuildings(c.pos, CONFIG.car.radius, city.colliders);
    }
    if (policeResult === 'busted') wasted('BUSTED', `The PD caught you. Fine: ${fmtMoney(CONFIG.police.fine)} — you wake up at St. Solara Hospital.`);
    if (policeResult === 'wrecked' && state.mode === 'car') {
      const wreck = state.drivenCar;
      const i = parkedCars.indexOf(wreck);
      if (i >= 0) parkedCars.splice(i, 1);
      scene.remove(wreck.mesh);
      exitCar();
      hud.toast('Your car was wrecked by the PD.');
    }
    combat.update(dt);
    if (combat.thugs.length > 0 && state.mode === 'foot') {
      const dmg = combat.updateThugs(dt, player);
      if (dmg > 0) {
        hud.flashDamage();
        if (player.takeDamage(dmg)) wasted('WASTED', 'The Vipers got the better of you. You wake up at St. Solara Hospital, $100 lighter.');
      }
    }
    if (combat.pickups.length > 0 && state.mode === 'foot') {
      const got = combat.updatePickups(player.pos);
      if (got > 0) {
        audio.blip();
        hud.toast(`Package collected (${combat.pickupsLeft} left).`);
      }
    }

    // --- missions ---
    const missionCtx = {
      playerX: state.mode === 'car' ? state.drivenCar.pos.x : player.pos.x,
      playerZ: state.mode === 'car' ? state.drivenCar.pos.z : player.pos.z,
      inCar: state.mode === 'car',
      wanted: police.wanted,
      thugsLeft: combat.thugsLeft,
      pickupsLeft: combat.pickupsLeft,
    };
    missions.update(dt, missionCtx);
    const objKey = missions.active
      ? `${missions.active.def.id}|${missions.active.stage}|${missions.active.grabbed}|${missions.active.reachedHideout}`
      : 'roam';
    if (objKey !== state.lastObjective) {
      state.lastObjective = objKey;
      if (missions.active) {
        hud.setObjective(`MISSION ${missions.active.def.id} — ${missions.active.def.title}`, missions.active.def.objective);
      } else {
        const next = missions.nextAvailable();
        hud.setObjective('FREE ROAM', next
          ? `Find a pink marker and press E — next job: ${next.title}.`
          : 'Story complete. Solara Bay is yours — free roam.');
      }
    }
    if (missions.active?.timer > 0) {
      const t = Math.max(0, missions.active.timer);
      hud.el.timer.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      hud.el.timer.classList.remove('hidden');
    } else if (missions.active) {
      hud.el.timer.classList.add('hidden');
    }

    // --- context hint ---
    let hint = '';
    if (state.mode === 'foot') {
      const nearCar = nearestCar([...parkedCars, ...traffic.cars], player.pos.x, player.pos.z, 4);
      const nearMission = MISSION_DEFS.some((d) => !missions.completed.has(d.id) && !missions.active
        && dist2D(player.pos.x, player.pos.z, d.start.x, d.start.z) < 4);
      if (nearCar) hint = 'E — Steal car';
      else if (nearMission) {
        const d = MISSION_DEFS.find((m) => !missions.completed.has(m.id)
          && dist2D(player.pos.x, player.pos.z, m.start.x, m.start.z) < 4);
        hint = `E — Start mission: ${d.title}`;
      }
    } else {
      hint = 'E — Exit car';
    }
    hud.setHint(hint);

    // --- audio + HUD ---
    audio.update(dt, speedNorm, police.wanted);
    hud.update({
      dt,
      health: player.health,
      cash: state.cash,
      wanted: police.wanted,
      inCar: state.mode === 'car',
      speed: state.mode === 'car' ? state.drivenCar.speed : player.speed,
      weapon: combat.weapon,
      ammo: combat.ammo,
      reserve: combat.reserve,
      time: state.time,
      roadLines: ROAD_LINES,
      buildings: city.colliders,
      parkedCars: parkedCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      trafficCars: traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      policeCars: police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      missionTarget: missions.currentTarget(),
      playerX: missionCtx.playerX,
      playerZ: missionCtx.playerZ,
      playerHeading: state.mode === 'car' ? state.drivenCar.heading : player.heading,
    });

    // Autosave every 20 seconds of play.
    state.autosaveTimer += dt;
    if (state.autosaveTimer > 20) {
      state.autosaveTimer = 0;
      saveGame();
    }
  }

  // --- camera ---
  const focus = state.mode === 'car' && state.drivenCar ? state.drivenCar.pos : player.pos;
  camTarget.set(focus.x, focus.y + 1.6, focus.z);
  const cy = Math.cos(state.camPitch);
  const sy = Math.sin(state.camPitch);
  camPos.set(
    camTarget.x - Math.sin(state.camYaw) * state.camDist * cy,
    camTarget.y + state.camDist * sy + 1.2,
    camTarget.z - Math.cos(state.camYaw) * state.camDist * cy,
  );
  camera.position.lerp(camPos, 0.35);
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
  input.endFrame();
}

hud.showStart(SaveSys.hasSave());
animate();

// --- debug / testing hook (used by the screenshot + playtest driver) ---
window.__solara = {
  version: 1,
  state,
  player,
  police,
  missions,
  combat,
  traffic,
  parkedCars,
  startGame,
  startMission: (id) => missions.start(id),
  teleport: (x, z) => {
    if (state.mode === 'car' && state.drivenCar) {
      state.drivenCar.pos.set(x, 0, z);
      state.drivenCar.speed = 0;
    } else {
      player.pos.set(x, 0, z);
    }
  },
  setWanted: (n) => { police.wanted = n; police._syncCars(); },
  enterNearestCar: () => stealOrEnter(),
  getStatus: () => ({
    started: state.started,
    paused: state.paused,
    mode: state.mode,
    cash: state.cash,
    health: player.health,
    wanted: police.wanted,
    mission: missions.active ? missions.active.def.title : null,
    missionStage: missions.active ? missions.active.stage : null,
    completed: [...missions.completed],
    player: { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) },
    inCar: state.mode === 'car',
    speed: state.mode === 'car' ? +state.drivenCar.speed.toFixed(1) : +player.speed.toFixed(1),
    thugsLeft: combat.thugsLeft,
    pickupsLeft: combat.pickupsLeft,
    trafficCars: traffic.cars.length,
    policeCars: police.cars.length,
  }),
};
