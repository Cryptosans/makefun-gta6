// Solara Bay — the Game: loop, camera, menus, interaction, damage, save, debug hooks.
import * as THREE from 'three';
import { clamp, dist2D } from './utils.js';
import { City } from './city.js';
import { Traffic, drivePlayerCar } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu'; // menu | playing | paused | gameover
    this.cash = 0;
    this.elapsed = 0;
    this.lastDamageAt = -99;
    this.fps = 0;
    this.errors = [];
    this.cameraYaw = 0;
    this.cameraPitch = 0.34;
    this.lastDragAt = -99;
    this.markerDirty = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

    this.city = new City(this.scene);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.player = new Player(this.scene, this.city, this.input);
    this.traffic = new Traffic(this.scene, this.city);
    this.peds = new Pedestrians(this.scene, this.city);
    this.police = new Police(this.scene, this.city, this);
    this.combat = new Combat(this.scene, this.city, this);
    this.missions = new Missions(this);
    this.hud = new HUD(this);

    this._buildMarker();
    this._wireMenu();
    this._wireKeys();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('error', (e) => this.errors.push(String(e.message || e.error)));
    this._resize();
    this._showMenu();
    this._loop = this._loop.bind(this);
    this._lastT = performance.now();
    requestAnimationFrame(this._loop);
    this._installDebugHooks();
  }

  _buildMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.6, 34, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 17;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd75e }),
    );
    gem.position.y = 5;
    g.add(beam, ring, gem);
    g.userData = { beam, ring, gem };
    g.visible = false;
    this.scene.add(g);
    this.markerGroup = g;
  }

  _wireMenu() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => { this.audio.init(); this.audio.click(); clearSave(); this._newGame(); });
    $('btn-continue').addEventListener('click', () => { this.audio.init(); this.audio.click(); this._continueGame(); });
    $('btn-how').addEventListener('click', () => { $('menu-controls').classList.toggle('hidden'); });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => { this._newGame(); });
    $('btn-quit').addEventListener('click', () => { this.saveGame(); this._showMenu(); });
    $('btn-retry').addEventListener('click', () => this._respawn());
    $('btn-gomenu').addEventListener('click', () => this._showMenu());
    if (hasSave()) $('btn-continue').classList.remove('hidden');
  }

  _wireKeys() {
    this.input.onKey = (code, down) => {
      if (!down) return;
      if (code === 'KeyM') { const m = this.audio.toggleMute(); this.hud.toast(m ? 'Sound muted' : 'Sound on'); return; }
      if (code === 'KeyP' || code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (this.state !== 'playing') return;
      if (code === 'KeyE') this._interact();
    };
    this.input.onMouseDown = () => {
      if (this.state !== 'playing') return;
      if (!this.player.inCar) this.combat.shoot(this.camera, this.player);
    };
  }

  _showMenu() {
    this.state = 'menu';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('loading').classList.add('hidden');
    const btn = document.getElementById('btn-continue');
    if (hasSave()) btn.classList.remove('hidden'); else btn.classList.add('hidden');
  }

  _startPlaying() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'playing';
  }

  _newGame() {
    this.cash = 0;
    this.player.reset(0, 20);
    this.police.clearAll();
    this.combat.clearGang();
    this.missions.startStory();
    this.cameraYaw = Math.PI;
    this._startPlaying();
    this.hud.toast('Welcome to Solara Bay. Steal a car — press E near one.');
  }

  _continueGame() {
    const s = loadSave();
    this._newGame();
    if (s) {
      this.cash = s.cash ?? 0;
      this.player.reset(s.x ?? 0, s.z ?? 20);
      this.player.health = s.health ?? 100;
      this.missions.completed = s.completed ?? [];
      const idx = Math.min(s.missionIndex ?? 0, 5);
      this.missions.index = idx;
      this.missions.startMission(idx);
      this.hud.toast('Welcome back, Rico.');
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.setEngine(0, false);
    this.audio.setSiren(false);
    const list = this.missions.statusList().map((m) => {
      const cls = m.state === 'done' ? 'done' : m.state === 'current' ? 'current' : 'locked';
      const mark = m.state === 'done' ? '✓' : m.state === 'current' ? '▶' : '·';
      return `<div class="${cls}">${mark} MISSION ${m.id} — ${m.title}</div>`;
    }).join('');
    document.getElementById('pause-missions').innerHTML = list;
    document.getElementById('pause').classList.remove('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
  }

  _respawn() {
    this.player.reset(0, 20);
    this.player.health = 100;
    this.cash = Math.max(0, this.cash - 200);
    this.police.clearAll();
    this.missions.startMission(this.missions.index);
    document.getElementById('gameover').classList.add('hidden');
    this._startPlaying();
    this.hud.toast('Patched up at Solara General. -$200 hospital fee.');
  }

  saveGame() {
    writeSave({
      cash: this.cash,
      missionIndex: this.missions.index,
      completed: this.missions.completed,
      x: this.player.x, z: this.player.z,
      health: this.player.health,
    });
  }

  addCash(n, reason) {
    this.cash += n;
    this.audio.cash();
    if (reason) this.hud.toast(`+$${n} — ${reason}`);
  }

  damagePlayer(amount, source) {
    if (this.state !== 'playing') return;
    this.player.health -= amount;
    this.lastDamageAt = this.elapsed;
    this.hud.damageFlash();
    this.audio.thud();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.state = 'gameover';
      this.audio.setEngine(0, false);
      this.audio.setSiren(false);
      this.audio.missionFail();
      document.getElementById('gameover-title').textContent = this.police.stars > 0 ? 'BUSTED' : 'WASTED';
      document.getElementById('gameover').classList.remove('hidden');
    }
  }

  _interact() {
    const p = this.player;
    if (p.inCar) {
      const car = p.exitCar();
      car.parked = true;
      this.traffic.cars.push(car);
      this.hud.toast('You ditched the car.');
      return;
    }
    // Nearest stealable car: traffic first, then a parked police car.
    const car = this.traffic.nearestCar(p.x, p.z, 4.2)
      || this._nearestPoliceCar(4.2);
    if (!car) return;
    if (car.police) {
      const i = this.police.cars.indexOf(car);
      if (i >= 0) this.police.cars.splice(i, 1);
      this.police.addHeat(2, 'Stole a police cruiser');
    } else {
      this.traffic.removeCar(car);
      // removeCar also takes the mesh out of the scene; the stolen car is
      // still the player's car, so put its mesh straight back in.
      this.scene.add(car.mesh);
      this.police.addHeat(1, 'Grand theft auto');
    }
    p.enterCar(car);
    this.audio.horn();
    this.peds.scare(p.x, p.z, 18);
  }

  _nearestPoliceCar(maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.police.cars) {
      const d = dist2D(this.player.x, this.player.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _updateCamera(dt) {
    const mouse = this.input.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      this.cameraYaw -= mouse.dx * 0.0042;
      this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.003, 0.08, 1.1);
      this.lastDragAt = this.elapsed;
    }
    const p = this.player;
    // While driving, ease the camera behind the car when the player is not dragging.
    if (p.inCar && this.elapsed - this.lastDragAt > 1.6) {
      let diff = p.heading - this.cameraYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.cameraYaw += diff * Math.min(1, dt * 1.4);
    }
    const dist = p.inCar ? 11.5 : 8.5;
    const tx = p.x, ty = 1.7, tz = p.z;
    const fx = Math.sin(this.cameraYaw), fz = Math.cos(this.cameraYaw);
    const cp = Math.cos(this.cameraPitch), sp = Math.sin(this.cameraPitch);
    const cx = tx - fx * dist * cp;
    const cy = ty + dist * sp + 0.6;
    const cz = tz - fz * dist * cp;
    const k = 1 - Math.exp(-14 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.lookAt(tx, ty, tz);
  }

  _updateMarker(dt) {
    const m = this.missions.marker;
    const g = this.markerGroup;
    if (!m || this.state !== 'playing') { g.visible = false; return; }
    g.visible = true;
    g.position.set(m.x, 0, m.z);
    const pulse = 1 + Math.sin(this.elapsed * 4) * 0.12;
    g.userData.ring.scale.setScalar(pulse);
    g.userData.gem.position.y = 5 + Math.sin(this.elapsed * 2.5) * 0.6;
    g.userData.gem.rotation.y += dt * 1.5;
  }

  _updateInteractPrompt() {
    const p = this.player;
    if (this.state !== 'playing') { this.hud.showInteract(null); return; }
    if (p.inCar) { this.hud.showInteract('to exit the car'); return; }
    const car = this.traffic.nearestCar(p.x, p.z, 4.2) || this._nearestPoliceCar(4.2);
    this.hud.showInteract(car ? (car.police ? 'to steal the police cruiser' : 'to steal the car') : null);
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    const dt = clamp((t - this._lastT) / 1000, 0.001, 0.05);
    this._lastT = t;
    this.fps = Math.round(1 / Math.max(dt, 0.001));
    if (this.state === 'playing') {
      this.elapsed += dt;
      const p = this.player;
      if (p.inCar && p.car) {
        const res = drivePlayerCar(p.car, this.input, dt, this.city, this.traffic.cars, this.peds, this.audio);
        p.syncToCar();
        this.audio.setEngine(Math.abs(p.car.speed) / 40, true);
      } else {
        p.updateOnFoot(dt, this.cameraYaw);
        this.audio.setEngine(0, false);
      }
      this.traffic.update(dt, p.inCar ? p.car : null);
      this.peds.update(dt, p.inCar ? p.car : null, (ped) => {
        this.police.addHeat(2, 'Pedestrian run over');
        this.audio.thud();
      });
      this.police.update(dt, p);
      this.combat.update(dt, p);
      this.missions.update(dt);
      // Slow health regen when the heat is off.
      if (this.police.stars === 0 && this.elapsed - this.lastDamageAt > 5) {
        p.health = Math.min(100, p.health + 3 * dt);
      }
      // Water shimmer.
      if (this.city.water) {
        this.city.water.position.y = 0.05 + Math.sin(this.elapsed * 0.8) * 0.03;
      }
      this._updateMarker(dt);
      this._updateInteractPrompt();
      this.hud.update(dt);
      // Autosave every 20s.
      if (Math.floor(this.elapsed) % 20 === 0 && Math.floor(this.elapsed - dt) % 20 !== 0) this.saveGame();
    }
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _installDebugHooks() {
    // Used by automated play-tests and screenshot staging. Not a cheat menu:
    // it only moves the camera/player and reads state; missions still complete
    // through the game's own triggers.
    const api = {
      game: this,
      state: () => ({
        state: this.state,
        x: +this.player.x.toFixed(2), z: +this.player.z.toFixed(2),
        heading: +this.player.heading.toFixed(2),
        inCar: this.player.inCar,
        speed: this.player.car ? +this.player.car.speed.toFixed(2) : 0,
        health: Math.round(this.player.health),
        cash: this.cash,
        wanted: this.police.stars,
        mission: this.missions.current ? this.missions.current.id : null,
        missionTitle: this.missions.current ? this.missions.current.title : null,
        step: this.missions.step ? this.missions.step.label : null,
        stepIndex: this.missions.stepIndex,
        marker: this.missions.marker,
        timer: this.missions.timer,
        policeCars: this.police.cars.length,
        cops: this.police.cops.length,
        gang: this.combat.gangAlive(),
        traffic: this.traffic.cars.length,
        peds: this.peds.list.length,
        fps: this.fps,
        errors: this.errors,
      }),
      teleport: (x, z, heading) => {
        const p = this.player;
        if (p.inCar && p.car) {
          p.car.x = x; p.car.z = z;
          if (heading !== undefined) p.car.heading = heading;
          p.car.speed = 0;
          p.car.sync();
          p.syncToCar();
        } else {
          p.x = x; p.z = z;
          if (heading !== undefined) p.heading = heading;
          p.mesh.position.set(x, 0, z);
        }
        return api.state();
      },
      setWanted: (n) => { this.police.setStars(n); return this.police.stars; },
      startMission: (i) => { this.missions.startMission(i - 1); return this.missions.current.title; },
      lookAt: (x, z) => {
        this.cameraYaw = Math.atan2(x - this.player.x, z - this.player.z);
        // Freeze the driving camera-ease so a staged view stays put.
        this.lastDragAt = 1e9;
        return this.cameraYaw;
      },
      // Put the camera exactly where _updateCamera would put it, now.
      snapCamera: () => {
        const p = this.player;
        const dist = p.inCar ? 11.5 : 8.5;
        const fx = Math.sin(this.cameraYaw), fz = Math.cos(this.cameraYaw);
        const cp = Math.cos(this.cameraPitch), sp = Math.sin(this.cameraPitch);
        this.camera.position.set(
          p.x - fx * dist * cp,
          1.7 + dist * sp + 0.6,
          p.z - fz * dist * cp,
        );
        this.camera.lookAt(p.x, 1.7, p.z);
        return [this.camera.position.x, this.camera.position.y, this.camera.position.z];
      },
    };
    window.__sb = api;
  }
}
