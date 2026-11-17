// player.js — Rico Vale on foot and behind the wheel: movement, jumping,
// entering and stealing cars, and the third-person camera rig.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  function Player(game) {
    this.game = game;
    this.x = 0; this.z = 0; this.y = 0;
    this.angle = 0;          // facing, radians (0 = +z)
    this.vy = 0;
    this.onGround = true;
    this.inCar = false;
    this.health = 100;
    this.speed = 0;
    this.punchAnim = 0;
    this.model = window.SB.makePersonModel(0xd23b2e, 0xe0ac69, { hair: 0x1c1410 });
    this.model.position.set(0, 0, 0);
    game.scene.add(this.model);
    // camera rig
    this.camYaw = Math.PI;   // behind the player looking north-ish
    this.camPitch = 0.32;
    this.camDist = 9.5;
    this.dragging = false;
    this.lastMX = 0; this.lastMY = 0;
  }

  Player.prototype.place = function (x, z, angle) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.angle = angle || 0;
    this.model.position.set(x, 0, z);
    this.model.rotation.y = this.angle;
  };

  Player.prototype.damage = function (amount, kind) {
    if (this.game.state !== 'playing') return;
    this.health = U.clamp(this.health - amount, 0, 100);
    this.game.hud.flashDamage();
    if (this.health <= 0) this.game.wasted(kind);
  };

  Player.prototype.heal = function (amount) {
    this.health = U.clamp(this.health + amount, 0, 100);
  };

  Player.prototype.updateFoot = function (dt, input) {
    var run = input.run;
    var speedTarget = run ? C.runSpeed : C.walkSpeed;
    var fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    var strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // movement is relative to the camera yaw
    var moveX = 0, moveZ = 0;
    if (fwd !== 0 || strafe !== 0) {
      var cy = this.camYaw;
      var fx = Math.sin(cy), fz = Math.cos(cy);
      var rx = Math.sin(cy + Math.PI / 2), rz = Math.cos(cy + Math.PI / 2);
      moveX = fx * fwd + rx * strafe;
      moveZ = fz * fwd + rz * strafe;
      var len = Math.hypot(moveX, moveZ);
      moveX /= len; moveZ /= len;
      this.angle = U.lerpAngle(this.angle, Math.atan2(moveX, moveZ), U.clamp(dt * 12, 0, 1));
    }
    this.speed = U.damp(this.speed, (fwd !== 0 || strafe !== 0) ? speedTarget : 0, 10, dt);
    var nx = this.x + moveX * this.speed * dt;
    var nz = this.z + moveZ * this.speed * dt;
    var res = window.SB.collideCircle(this.game.world.footColliders, nx, nz, 0.55);
    this.x = U.clamp(res.x, -314, 314);
    this.z = U.clamp(res.z, -314, 358); // 358 is the pier end; the water block is applied in main.js
    // jump + gravity, against the ground underfoot (pier deck or street)
    var ground = window.SB.groundYAt(this.game.world, this.x, this.z);
    if (input.jump && this.onGround) {
      this.vy = C.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= C.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) { this.y = ground; this.vy = 0; this.onGround = true; }
    } else if (ground < this.y - 0.01) {
      this.onGround = false; // walked off the pier edge: fall
      this.vy = 0;
    } else {
      this.y = ground; // step up onto the pier deck
    }
    this.model.position.set(this.x, this.y, this.z);
    this.model.rotation.y = this.angle;
    this.punchAnim = Math.max(0, this.punchAnim - dt);
    var armSwing = this.punchAnim > 0 ? -1.6 * (this.punchAnim / 0.3) : 0;
    var parts = this.model.userData.parts;
    parts.armR.rotation.x = armSwing;
    if (this.speed > 0.3) {
      this.walkPhase = (this.walkPhase || 0) + dt * this.speed * 2.4;
      window.SB.animateWalk(this.model, this.walkPhase, U.clamp(this.speed / C.runSpeed, 0.3, 1));
      parts.armR.rotation.x = armSwing !== 0 ? armSwing : parts.armR.rotation.x;
    } else {
      parts.legL.rotation.x = 0; parts.legR.rotation.x = 0;
      parts.armL.rotation.x = 0;
      if (armSwing === 0) parts.armR.rotation.x = 0;
    }
  };

  // Try to enter the nearest car; returns a status string for the HUD.
  Player.prototype.tryEnterCar = function () {
    var game = this.game;
    var near = game.traffic.nearestCar(this.x, this.z, 4.5);
    if (!near) return 'no-car';
    if (near.kind === 'traffic') {
      game.traffic.removeTrafficCar(near.ref);
      game.peds.spawnFleeingDriver(near.x, near.z);
      game.police.addWanted(1, 'Car stolen in broad daylight');
      game.hud.toast('Stole a ' + near.name + ' — the driver ran for it', 'bad');
    } else {
      near.ref.taken = true;
      game.hud.toast('Took the ' + near.name, 'good');
    }
    game.playerCar.enter(near.x, near.z, near.angle, near.color, near.name);
    this.inCar = true;
    this.model.visible = false;
    game.sfx.horn();
    return 'entered';
  };

  Player.prototype.exitCar = function () {
    var game = this.game;
    var car = game.playerCar;
    var sideX = car.x + Math.cos(car.angle) * 2.4;
    var sideZ = car.z - Math.sin(car.angle) * 2.4;
    var res = window.SB.collideCircle(game.world.colliders, sideX, sideZ, 0.6);
    this.place(res.x, res.z, car.angle);
    this.inCar = false;
    this.model.visible = true;
    car.exit();
  };

  Player.prototype.updateCamera = function (dt, camera) {
    var game = this.game;
    var target, desiredYaw, desiredPitch, desiredDist;
    if (this.inCar) {
      var car = game.playerCar;
      target = new THREE.Vector3(car.x, 2.2, car.z);
      desiredYaw = car.angle + Math.PI; // behind the car
      desiredPitch = 0.24;
      desiredDist = 9 + Math.abs(car.speed) * 0.09;
    } else {
      target = new THREE.Vector3(this.x, 1.8 + this.y, this.z);
      desiredYaw = this.camYaw;
      desiredPitch = this.camPitch;
      desiredDist = this.camDist;
    }
    // smooth yaw: in a car follow the car, on foot keep the dragged yaw
    if (this.inCar) {
      this.camYaw = U.lerpAngle(this.camYaw, desiredYaw, U.clamp(dt * 2.4, 0, 1));
    }
    var pitch = U.clamp(desiredPitch, 0.08, 1.1);
    var dist = desiredDist;
    var cx = target.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist;
    var cz = target.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist;
    var cy = target.y + Math.sin(pitch) * dist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(target.x, target.y, target.z);
    // keep the camera out of buildings
    if (camera.position.y < 0.6) camera.position.y = 0.6;
  };

  window.SB.Player = Player;
})();
