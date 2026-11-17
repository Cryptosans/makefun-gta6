// main.js — Solara Bay boot, game loop, input, state machine (menu / playing /
// paused / busted / wasted), cash pickups, car collisions and the screenshot
// scene setups (?shot=chase|foot|mission|beach). Written for this game.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  function Game() {
    this.state = 'menu';
    this.cash = C.startCash;
    this.time = 0;
    this.menuAngle = 0;
    this.pedHitCooldown = 0;
    this.mapTimer = 0;
    this.input = { up: false, down: false, left: false, right: false, run: false, jump: false };
  }

  Game.prototype.boot = function () {
    var self = this;
    window.SB.game = this;
    this.renderer = new THREE.WebGLRenderer({ canvas: U.el('game'), antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 60, 120);
    this.sfx = new window.SB.SoundFX();
    this.world = window.SB.buildCity(this.scene, window.SB.rng);
    this.traffic = new window.SB.TrafficSystem(this.scene, this.world, window.SB.rng);
    this.peds = new window.SB.PedSystem(this.scene, this.world, window.SB.rng);
    this.playerCarModel = window.SB.makeCarModel(0xd23b2e);
    this.playerCarModel.visible = false;
    this.scene.add(this.playerCarModel);
    this.playerCar = new window.SB.PlayerCar(this.playerCarModel);
    this.player = new window.SB.Player(this);
    this.police = new window.SB.PoliceSystem(this.scene, this.world, window.SB.rng, this.sfx, function () { self.busted(); });
    this.combat = new window.SB.Combat(this.scene, this.sfx, this);
    this.missions = new window.SB.MissionSystem(this);
    this.hud = new window.SB.Hud(this);
    this.buildPickups();
    this.bindInput();
    this.bindButtons();
    this.player.place(this.world.spawnPoints.start.x, this.world.spawnPoints.start.z, Math.PI);
    this.refreshHud();
    window.addEventListener('resize', function () { self.onResize(); });
    this.hud.showOverlay('start-screen');
    U.el('continue-btn').style.display = window.SB.hasSave() ? 'inline-block' : 'none';
    this.applyShotParam();
    this.renderer.setAnimationLoop(function () { self.frame(); });
  };

  Game.prototype.onResize = function () {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  // ---- cash pickups ----
  Game.prototype.buildPickups = function () {
    var self = this;
    this.world.pickups.forEach(function (p) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x553300 }));
      mesh.position.set(p.x, 0.9, p.z);
      self.scene.add(mesh);
      p.mesh = mesh;
    });
  };

  Game.prototype.updatePickups = function (dt) {
    var self = this;
    this.world.pickups.forEach(function (p) {
      if (p.taken || !p.mesh) return;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = 0.9 + Math.sin(self.time * 3 + p.x) * 0.15;
      if (Math.hypot(p.x - self.player.x, p.z - self.player.z) < 2.4) {
        p.taken = true;
        self.scene.remove(p.mesh);
        p.mesh = null;
        self.cash += 50;
        self.sfx.coin();
        self.hud.toast('Cash pickup +$50', 'good');
      }
    });
  };

  // ---- input ----
  Game.prototype.bindInput = function () {
    var self = this;
    var keyMap = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump',
    };
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') e.preventDefault();
      var k = keyMap[e.code];
      if (k) self.input[k] = true;
      if (e.repeat) return;
      if (e.code === 'KeyE') self.onEnterCar();
      if (e.code === 'KeyF') self.onPunch();
      if (e.code === 'KeyM') self.onMissionKey();
      if (e.code === 'KeyH') self.sfx.horn();
      if (e.code === 'KeyP' || e.code === 'Escape') self.onPauseKey();
      if (e.code === 'Enter' && (self.state === 'busted' || self.state === 'wasted')) self.respawn();
      if (e.code === 'KeyC') {
        self.player.camDist = self.player.camDist > 10 ? 9.5 : 14;
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = keyMap[e.code];
      if (k) self.input[k] = false;
    });
    var canvas = U.el('game');
    canvas.addEventListener('mousedown', function (e) {
      if (self.state !== 'playing') return;
      if (e.button === 0) {
        if (!self.player.inCar) self.combat.shoot(self.player, self.camera);
        self.player.dragging = true;
        self.player.lastMX = e.clientX; self.player.lastMY = e.clientY;
      }
    });
    window.addEventListener('mousemove', function (e) {
      if (!self.player.dragging) return;
      var dx = e.clientX - self.player.lastMX;
      var dy = e.clientY - self.player.lastMY;
      self.player.lastMX = e.clientX; self.player.lastMY = e.clientY;
      self.player.camYaw -= dx * 0.005;
      self.player.camPitch = U.clamp(self.player.camPitch + dy * 0.004, 0.08, 1.1);
    });
    window.addEventListener('mouseup', function () { self.player.dragging = false; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.player.camDist = U.clamp(self.player.camDist + (e.deltaY > 0 ? 1.2 : -1.2), 6, 16);
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  Game.prototype.bindButtons = function () {
    var self = this;
    U.el('start-btn').addEventListener('click', function () { self.startGame(false); });
    U.el('continue-btn').addEventListener('click', function () { self.startGame(true); });
    U.el('sound-btn').addEventListener('click', function () {
      self.sfx.ensure();
      self.sfx.setMuted(!self.sfx.muted);
      U.el('sound-btn').textContent = self.sfx.muted ? '🔇 Sound: off' : '🔊 Sound: on';
    });
    U.el('resume-btn').addEventListener('click', function () { self.togglePause(false); });
    U.el('restart-mission-btn').addEventListener('click', function () {
      self.missions.abort();
      self.togglePause(false);
      self.missions.startNext();
    });
    U.el('save-menu-btn').addEventListener('click', function () {
      self.saveGame();
      self.togglePause(false);
      self.state = 'menu';
      self.hud.showOverlay('start-screen');
    });
    U.el('mute-btn').addEventListener('click', function () {
      self.sfx.setMuted(!self.sfx.muted);
      U.el('mute-btn').textContent = self.sfx.muted ? '🔇 Unmute' : '🔊 Mute';
    });
    U.el('respawn-btn').addEventListener('click', function () { self.respawn(); });
    U.el('mission-start-btn').addEventListener('click', function () { self.onMissionKey(); });
  };

  // ---- state flow ----
  Game.prototype.startGame = function (useSave) {
    this.sfx.ensure();
    this.sfx.click();
    if (useSave) {
      var data = window.SB.loadGame();
      if (data) {
        this.cash = data.cash;
        this.missions.index = data.missionsDone;
        this.player.health = data.health || 100;
        this.player.place(data.x || 0, data.z || 0, Math.PI);
        data.pickupsTaken.forEach(function (t, i) {
          if (t && this.world.pickups[i]) {
            this.world.pickups[i].taken = true;
            if (this.world.pickups[i].mesh) { this.scene.remove(this.world.pickups[i].mesh); this.world.pickups[i].mesh = null; }
          }
        }, this);
        this.hud.toast('Save loaded — welcome back to Solara Bay', 'good');
      }
    } else {
      this.cash = C.startCash;
      this.missions.index = 0;
      this.player.health = 100;
      this.player.place(this.world.spawnPoints.start.x, this.world.spawnPoints.start.z, Math.PI);
    }
    this.state = 'playing';
    this.hud.showOverlay(null);
    this.refreshHud();
    if (!this.missions.active && !this.missions.allDone()) {
      this.hud.showNextMission(window.SB.MISSIONS[this.missions.index]);
      this.hud.say('MARA: Rico. You are in Solara Bay now. Press M when you are ready for work.');
    }
  };

  Game.prototype.onMissionKey = function () {
    if (this.state !== 'playing') return;
    if (this.missions.active) {
      this.hud.toast('Mission in progress: ' + this.missions.active.def.title, '');
      return;
    }
    this.missions.startNext();
  };

  Game.prototype.onEnterCar = function () {
    if (this.state !== 'playing') return;
    if (this.player.inCar) {
      this.player.exitCar();
      this.sfx.click();
    } else {
      var res = this.player.tryEnterCar();
      if (res === 'no-car') this.hud.toast('No car close enough', '');
    }
    this.refreshHud();
  };

  Game.prototype.onPunch = function () {
    if (this.state !== 'playing' || this.player.inCar) return;
    this.combat.punch(this.player);
  };

  Game.prototype.onPauseKey = function () {
    if (this.state === 'playing') this.togglePause(true);
    else if (this.state === 'paused') this.togglePause(false);
  };

  Game.prototype.togglePause = function (pause) {
    if (pause && this.state === 'playing') {
      this.state = 'paused';
      this.hud.showOverlay('pause-screen');
    } else if (!pause && this.state === 'paused') {
      this.state = 'playing';
      this.hud.showOverlay(null);
    }
  };

  Game.prototype.loseCash = function () {
    var loss = Math.min(this.cash, Math.max(C.bustFlatLoss, Math.floor(this.cash * C.bustCashLoss)));
    this.cash -= loss;
    return loss;
  };

  Game.prototype.busted = function () {
    if (this.state !== 'playing') return;
    var loss = this.loseCash();
    this.state = 'busted';
    this.sfx.busted();
    this.sfx.setSiren(false);
    this.police.clearWanted();
    if (this.player.inCar) this.player.exitCar();
    this.missions.abort();
    this.hud.showEnd('BUSTED', 'The Bay PD took you in. You lost ' + U.fmtCash(loss) + ' in fines and bail.');
  };

  Game.prototype.wasted = function (kind) {
    if (this.state !== 'playing') return;
    var loss = Math.min(this.cash, 100);
    this.cash -= loss;
    this.state = 'wasted';
    this.sfx.busted();
    this.sfx.setSiren(false);
    this.police.clearWanted();
    if (this.player.inCar) this.player.exitCar();
    this.missions.abort();
    var why = kind === 'ram' ? 'You were run down in traffic.' : 'You took one hit too many.';
    this.hud.showEnd('WASTED', why + ' The hospital patched you up for ' + U.fmtCash(loss) + '.');
  };

  Game.prototype.respawn = function () {
    var sp = this.world.spawnPoints.hospital;
    this.player.health = 100;
    this.player.place(sp.x, sp.z, 0);
    this.police.clearWanted();
    this.state = 'playing';
    this.hud.showOverlay(null);
    this.hud.toast('Back on your feet at Solara General', 'good');
    this.refreshHud();
  };

  Game.prototype.saveGame = function () {
    if (window.SB.saveGame(this)) this.hud.toast('Progress saved', 'good');
  };

  Game.prototype.refreshHud = function () {
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setStars(this.police.stars);
    this.hud.setMissions(this.missions.index, window.SB.MISSIONS.length);
  };

  // ---- collisions: player car vs traffic and pedestrians ----
  Game.prototype.updateCarCollisions = function (dt) {
    var self = this;
    var car = this.playerCar;
    if (!car.active) return;
    this.traffic.cars.forEach(function (t) {
      var d = Math.hypot(t.model.position.x - car.x, t.model.position.z - car.z);
      if (d < 4.4) {
        if (Math.abs(car.speed) > 4) {
          car.speed *= 0.55;
          self.sfx.crash();
          self.hud.flashDamage();
        }
        t.wait = Math.max(t.wait, 0.6);
      }
    });
    this.pedHitCooldown = Math.max(0, this.pedHitCooldown - dt);
    this.peds.peds.forEach(function (p) {
      if (p.dead) return;
      var d = Math.hypot(p.model.position.x - car.x, p.model.position.z - car.z);
      if (d < 2.3 && Math.abs(car.speed) > 3 && self.pedHitCooldown <= 0) {
        self.pedHitCooldown = 1;
        p.dead = true;
        self.peds.scene.remove(p.model);
        self.sfx.crash();
        self.police.addWanted(1, 'You ran over a pedestrian');
        self.peds.fleeFrom(car.x, car.z, 30);
      }
    });
  };

  // ---- per-frame ----
  Game.prototype.frame = function () {
    var dt = this._last ? Math.min(0.05, (performance.now() - this._last) / 1000) : 0.016;
    this._last = performance.now();
    this.time += dt;

    if (this.state === 'menu') {
      // slow orbit over downtown behind the title screen
      this.menuAngle += dt * 0.05;
      var cx = Math.sin(this.menuAngle) * 150, cz = Math.cos(this.menuAngle) * 150;
      this.camera.position.set(cx, 70, cz);
      this.camera.lookAt(0, 0, 0);
      this.traffic.update(dt, this.playerCar);
      this.peds.update(dt);
      this.world.waterMat.opacity = 0.88 + Math.sin(this.time * 0.8) * 0.04;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // playing
    var player = this.player;
    if (player.inCar) {
      this.playerCar.update(dt, this.input, this.world, function (speed) {
        this.sfx.crash();
        player.damage(speed * 0.55, 'ram');
      }.bind(this));
      // water blocks cars
      if (this.playerCar.z > 304) { this.playerCar.z = 304; this.playerCar.speed *= 0.5; }
      // the player's position tracks the car (police, missions, HUD all read it)
      player.x = this.playerCar.x;
      player.z = this.playerCar.z;
      this.sfx.setEngine(Math.abs(this.playerCar.speed) / C.carMaxSpeed, true);
    } else {
      player.updateFoot(dt, this.input);
      // water blocks walking, except on the pier walkway (x near -80, up to its end)
      var onPier = Math.abs(player.x + 80) < 8.5 && player.z < 356;
      if (!onPier && player.z > 304) player.z = 304;
      if (player.z > 356) player.z = 356;
      this.sfx.setEngine(0, false);
    }
    this.traffic.update(dt, this.playerCar);
    this.peds.update(dt);
    this.police.update(dt, player, this.playerCar);
    this.combat.update(dt);
    this.missions.update(dt, player, this.playerCar);
    this.updatePickups(dt);
    this.updateCarCollisions(dt);
    player.updateCamera(dt, this.camera);
    this.world.waterMat.opacity = 0.88 + Math.sin(this.time * 0.8) * 0.04;

    // HUD
    this.refreshHud();
    this.hud.setSpeed(this.playerCar.active ? this.playerCar.speed * 3.6 : 0, this.playerCar.active, this.playerCar.name);
    if (!player.inCar) {
      var near = this.traffic.nearestCar(player.x, player.z, 4.5);
      this.hud.setPrompt(near ? 'E — Steal the ' + near.name : '');
    } else {
      this.hud.setPrompt('E — Get out    H — Horn');
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.08;
      this.hud.drawMinimap();
    }
    this.renderer.render(this.scene, this.camera);
  };

  // ---- screenshot scene setups (?shot=...) ----
  Game.prototype.applyShotParam = function () {
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    if (!shot) return;
    var sp = this.world.spawnPoints;
    this.state = 'playing';
    this.hud.showOverlay(null);
    if (shot === 'chase') {
      // driving down the avenue, 3 stars, two police cars on the tail
      this.playerCar.enter(0, 180, Math.PI, 0xd23b2e, 'Comet GT');
      this.player.inCar = true;
      this.player.model.visible = false;
      this.player.x = 0; this.player.z = 180;
      this.playerCar.speed = 26;
      this.missions.index = 4;
      this.missions.startNext(); // mission 5 forces 3 stars and spawns the police cars
      this.police.cars.forEach(function (c, i) {
        c.model.position.set((i ? 7 : -7), 0, 180 - 14 - i * 8);
        c.speed = 30;
      });
      this.hud.say('MARA: Tonight I ride with you, Rico. Don\'t stop. Don\'t panic.');
    } else if (shot === 'foot') {
      this.player.place(4, 60, Math.PI * 0.9);
      this.player.camYaw = Math.PI * 0.85;
      this.police.addWanted(0, '');
    } else if (shot === 'mission') {
      // on the pier deck, facing the Dock Rats with the marker beam ahead
      this.player.place(-80, 294, 0);
      this.player.camYaw = Math.PI;
      this.missions.index = 3;
      this.missions.startNext();
    } else if (shot === 'beach') {
      // east along the beach road, ocean on the right
      this.playerCar.enter(40, 240, Math.PI / 2, 0x2e6fd2, 'Sunrunner');
      this.player.inCar = true;
      this.player.model.visible = false;
      this.player.x = 40; this.player.z = 240;
      this.playerCar.speed = 28;
      this.player.camYaw = Math.PI / 2 + Math.PI;
    }
    this.refreshHud();
  };

  // ---- boot ----
  var game = new Game();
  try {
    game.boot();
  } catch (err) {
    var box = document.getElementById('boot-error');
    if (box) {
      box.style.display = 'block';
      box.textContent = 'Solara Bay failed to start: ' + err.message;
    }
    throw err;
  }

  // Debug hook for play-testing and screenshots (not a cheat menu in the game UI).
  window.SOLARA = {
    game: game,
    teleport: function (x, z) { game.player.place(x, z, 0); },
    setWanted: function (n) { game.police.clearWanted(); if (n > 0) game.police.addWanted(n, ''); },
    startMission: function (i) { game.missions.index = i; game.missions.startNext(); },
    addCash: function (n) { game.cash += n; game.refreshHud(); },
    version: 'solara-bay-1.0.0',
  };
})();
