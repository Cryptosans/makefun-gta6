// main.js — Solara Bay entry point.
// Builds the renderer and the world, wires every subsystem together
// (city, traffic, pedestrians, police, combat, missions, HUD, audio),
// runs the game loop, and exposes a small read-only debug handle at
// window.__solara for automated verification.

import * as THREE from 'three';
import { City } from './city.js';
import { Car, spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { clamp, dist2D, angleLerp, rand } from './utils.js';

const SAVE_EVERY_SECONDS = 20;

class World {
  constructor() {
    this.elapsed = 0;
    this.kills = 0;
    this.state = {
      cash: 0,
      health: 100,
      wanted: 0,
      timeMinutes: 480, // 08:00 on the in-game clock
      started: false,
      paused: false,
      gameOver: false,
      missionIndex: 0,
    };
    this._ramTimer = 0;
    this._saveTimer = 0;
    this._wastedTimer = 0;

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8d8);
    this.scene.fog = new THREE.Fog(0x87b8d8, 160, 420);

    this.camera = new THREE.PerspectiveCamera(
      62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 6, 112);

    // Sun + sky fill.
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
    sun.position.set(90, 140, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 400;
    this.scene.add(sun);
    const sky = new THREE.HemisphereLight(0xbfd8ee, 0x8a7a5a, 0.9);
    this.scene.add(sky);

    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.city = new City(this.scene);

    // Subsystems. Each gets the world so they can reach each other.
    this.traffic = new Traffic(this.scene, this.city);
    this.pedestrians = new Pedestrians(this.scene, this.city);
    this.police = new Police(this.scene, this.city, this);
    this.combat = new Combat(this.scene, this);
    this.missions = new Missions(this.scene, this);
    this.hud = new Hud(this);
    this.player = new Player(this.scene, this);

    // Parked cars to steal. The first one is the Comet GT for mission 1.
    this.parkedCars = spawnParkedCars(this.scene, this.city, 9);
    this.missionCar = this.parkedCars[0];
    this.missionCar.missionId = 'comet';

    // A few Red Bandanas hang around the plaza even outside missions,
    // so the streets always have something to fight.
    this.combat.spawnEnemy(14, 10);
    this.combat.spawnEnemy(-14, 8);
    this.combat.spawnEnemy(10, -14);

    this.playerCar = null;
    this._wireScreens();
    this._exposeDebugHandle();
    window.addEventListener('resize', () => this._onResize());
    this._clock = new THREE.Clock();
    this._animate();
  }

  // --- screens ----------------------------------------------------------

  _wireScreens() {
    this.startScreen = document.getElementById('start-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.wastedScreen = document.getElementById('wasted-screen');
    this.btnNew = document.getElementById('btn-new');
    this.btnContinue = document.getElementById('btn-continue');
    this.btnResume = document.getElementById('btn-resume');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnRespawn = document.getElementById('btn-respawn');

    if (!hasSave()) this.btnContinue.style.display = 'none';
    this.btnNew.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      clearSave();
      this._startNewGame();
    });
    this.btnContinue.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this._startContinuedGame();
    });
    this.btnResume.addEventListener('click', () => {
      this.audio.ensure();
      this._setPaused(false);
    });
    this.btnRestart.addEventListener('click', () => {
      this.audio.ensure();
      clearSave();
      this._startNewGame();
    });
    this.btnRespawn.addEventListener('click', () => {
      this.audio.ensure();
      this._respawn();
    });
    // Any first keypress also unlocks audio.
    window.addEventListener('keydown', () => this.audio.ensure(), { once: true });
  }

  _startNewGame() {
    this.state.cash = 0;
    this.state.health = 100;
    this.state.timeMinutes = 480;
    this.state.missionIndex = 0;
    this.kills = 0;
    this.police.clearAll();
    this.combat.clearEnemies();
    this.combat.spawnEnemy(14, 10);
    this.combat.spawnEnemy(-14, 8);
    this.combat.spawnEnemy(10, -14);
    if (this.player.inCar) this.player.exitCar();
    this.player.setPosition(0, 100, Math.PI);
    this.missions.index = 0;
    this.missions.status = 'idle';
    this.missions.nextStartAt = this.elapsed + 0.5;
    this.missions._hideBeacon();
    this.state.started = true;
    this.state.paused = false;
    this.state.gameOver = false;
    this.startScreen.style.display = 'none';
    this.pauseScreen.style.display = 'none';
    this.wastedScreen.style.display = 'none';
    this.hud.setObjective('Welcome to Solara Bay, Rico. Mission 1 starting...');
    this.hud.flashMessage('SOLARA BAY', '#ffd94d');
  }

  _startContinuedGame() {
    const data = loadGame();
    this._startNewGame();
    if (data) {
      this.state.cash = data.cash;
      this.state.health = data.health;
      this.state.missionIndex = data.missionIndex;
      this.missions.index = data.missionIndex;
      this.player.setPosition(data.playerX, data.playerZ, Math.PI);
    }
  }

  _setPaused(paused) {
    if (!this.state.started || this.state.gameOver) return;
    this.state.paused = paused;
    this.pauseScreen.style.display = paused ? 'flex' : 'none';
    if (paused) this.input.exitPointerLock();
  }

  _respawn() {
    this.state.gameOver = false;
    this.state.health = 100;
    this.state.cash = Math.max(0, this.state.cash - 100);
    this.police.clearAll();
    if (this.player.inCar) this.player.exitCar();
    this.player.setPosition(0, 30, Math.PI);
    this.wastedScreen.style.display = 'none';
    this.hud.flashMessage('Patched up at the plaza clinic (-$100)', '#7ae08a');
  }

  // --- world events called by subsystems --------------------------------

  get playerCar() {
    return this._playerCar;
  }

  set playerCar(car) {
    this._playerCar = car;
  }

  damagePlayer(amount, cause) {
    if (!this.state.started || this.state.gameOver || this.state.paused) return;
    this.state.health -= amount;
    this.hud.vignette.style.opacity = '0.55';
    setTimeout(() => { this.hud.vignette.style.opacity = '0'; }, 120);
    if (this.state.health <= 0) {
      this.state.health = 0;
      this.state.gameOver = true;
      this.input.exitPointerLock();
      this.wastedScreen.style.display = 'flex';
      this._wastedTimer = 0;
    }
  }

  onPoliceRam(car, playerInCar, playerCar) {
    if (this._ramTimer > 0) return;
    this._ramTimer = 0.6;
    this.audio.crash();
    if (playerInCar && playerCar) {
      this.damagePlayer(1, 'rammed by police');
      playerCar.speed *= 0.55;
    } else {
      this.damagePlayer(8, 'rammed by police');
      const push = Math.atan2(this.player.x - car.x, this.player.z - car.z);
      this.player.x += Math.sin(push) * 2;
      this.player.z += Math.cos(push) * 2;
    }
    this.police.addHeat(4, this.player.x, this.player.z);
  }

  onEnemyKilled(enemy) {
    this.kills++;
    this.police.addHeat(20, enemy.x, enemy.z);
    this.hud.flashMessage('Gang member down', '#7ae08a');
  }

  onMissionComplete(index) {
    this.state.missionIndex = index + 1;
    saveGame(this.state, { x: this.player.x, z: this.player.z });
  }

  // --- debug handle ------------------------------------------------------

  _exposeDebugHandle() {
    window.__solara = {
      missionIndex: 0,
      missionStatus: 'idle',
      cash: 0,
      wanted: 0,
      playerPos: { x: 0, z: 100 },
      beacon: null,
      heading: Math.PI,
      cameraYaw: Math.PI,
      police: [],
      enemies: [],
      speed: 0,
      inCar: false,
      missionStage: 0,
      health: 100,
      kills: 0,
    };
  }

  _updateDebugHandle() {
    const handle = window.__solara;
    handle.missionIndex = this.missions.index;
    handle.missionStatus = this.missions.status;
    handle.cash = Math.round(this.state.cash);
    handle.wanted = this.state.wanted;
    handle.playerPos = { x: this.player.x, z: this.player.z };
    const beacon = this.missions.beaconPos();
    handle.beacon = beacon ? { x: beacon.x, z: beacon.z } : null;
    handle.heading = this.player.heading;
    handle.cameraYaw = this.player.cameraYaw;
    handle.police = this.police.cruisers
      .filter((c) => !c.isPlayerCar)
      .map((c) => ({ x: Math.round(c.x), z: Math.round(c.z) }));
    handle.enemies = this.combat.enemies.map(
      (e) => ({ x: Math.round(e.x), z: Math.round(e.z), hp: Math.round(e.hp) }));
    handle.speed = this.playerCar ? this.playerCar.speed : this.player.speed;
    handle.inCar = this.player.inCar;
    handle.missionStage = this.missions.stageIndex;
    handle.health = Math.round(this.state.health);
    handle.kills = this.kills;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- camera ------------------------------------------------------------

  _updateCamera(dt) {
    const p = this.player;
    let targetYaw = p.cameraYaw;
    if (p.inCar && p.currentCar) {
      targetYaw = p.currentCar.heading;
      // Let the mouse look around briefly; the camera swings back.
      p.cameraYaw = angleLerp(p.cameraYaw, targetYaw, Math.min(1, dt * 2.4));
      targetYaw = p.cameraYaw;
    }
    const dist = p.inCar ? 10.5 : 7.5;
    const height = p.inCar ? 4.2 : 3.4;
    const fx = Math.sin(targetYaw);
    const fz = Math.cos(targetYaw);
    const desired = new THREE.Vector3(
      p.x - fx * dist,
      height,
      p.z - fz * dist
    );
    this.camera.position.lerp(desired, Math.min(1, dt * 6));
    const look = new THREE.Vector3(
      p.x + fx * 5,
      1.5,
      p.z + fz * 5
    );
    this.camera.lookAt(look);
  }

  // --- shooting ----------------------------------------------------------

  _updateShooting() {
    if (this.input.consumeClick() && this.state.started && !this.state.paused && !this.state.gameOver) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const origin = this.camera.position.clone();
      this.combat.playerShoot(origin, dir);
    }
  }

  // --- per-frame separation for the player's car -------------------------

  _separatePlayerCar() {
    const car = this.playerCar;
    if (!car) return;
    const obstacles = [...this.parkedCars, this.missionCar];
    for (const other of obstacles) {
      if (other === car || other.dead) continue;
      const d = dist2D(car.x, car.z, other.x, other.z);
      if (d < 3.4 && d > 0.01) {
        const push = Math.atan2(car.x - other.x, car.z - other.z);
        car.x = other.x + Math.sin(push) * 3.4;
        car.z = other.z + Math.cos(push) * 3.4;
        car.speed *= 0.5;
      }
    }
  }

  // --- main loop ----------------------------------------------------------

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this._clock.getDelta(), 0.1);
    this.elapsed += dt;
    this._ramTimer = Math.max(0, this._ramTimer - dt);

    if (this.input.pressed('Escape') && this.state.started) {
      this._setPaused(!this.state.paused);
    }

    if (this.state.started && !this.state.paused && !this.state.gameOver) {
      // In-game clock: one minute every two seconds.
      this.state.timeMinutes = (this.state.timeMinutes + dt * 0.5) % 1440;
      this.player.update(dt, this.input);
      this.playerCar = this.player.inCar ? this.player.currentCar : null;
      this._separatePlayerCar();
      this.traffic.update(dt, this.playerCar, this.player.x, this.player.z, this.parkedCars);
      this.pedestrians.update(dt);
      this.police.update(dt, this.player.x, this.player.z, this.player.inCar, this.playerCar);
      this.combat.update(dt, this.player.x, this.player.z, this.player.inCar);
      this.missions.update(dt);
      this.state.wanted = this.police.wanted;
      this._updateShooting();
      this.audio.update(dt, this.playerCar ? Math.abs(this.playerCar.speed) : 0, this.state.wanted);
      this.hud.update(dt);
      // Autosave while playing.
      this._saveTimer += dt;
      if (this._saveTimer > SAVE_EVERY_SECONDS) {
        this._saveTimer = 0;
        saveGame(this.state, { x: this.player.x, z: this.player.z });
      }
    } else if (this.state.gameOver) {
      // Auto-respawn a few seconds after being wasted if the player
      // does not click the button.
      this._wastedTimer += dt;
      if (this._wastedTimer > 6) this._respawn();
    }

    this._updateCamera(dt);
    this._updateDebugHandle();
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

new World();
