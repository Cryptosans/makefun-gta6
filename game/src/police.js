// police.js — the wanted system: stars, Solara Bay PD response, chases and busts.
// Police cars ram and pursue; officers on foot chase and arrest the player.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  function PoliceSystem(scene, world, rng, sfx, onBusted) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.sfx = sfx;
    this.onBusted = onBusted;
    this.stars = 0;
    this.quietTime = 0;
    this.decayTimer = 0;
    this.cars = [];
    this.officers = [];
    this.bustTimer = 0;
    this.shootTimer = 0;
  }

  PoliceSystem.prototype.addWanted = function (n, reason) {
    if (this.stars >= C.maxWanted) return;
    this.stars = U.clamp(this.stars + n, 0, C.maxWanted);
    this.quietTime = 0;
    this.decayTimer = 0;
    if (this.stars > 0 && reason) window.SB.game.hud.toast(reason + ' — wanted level ' + this.stars, 'bad');
    this.syncUnits();
    this.sfx.setSiren(this.stars > 0);
  };

  PoliceSystem.prototype.clearWanted = function () {
    this.stars = 0;
    this.quietTime = 0;
    this.syncUnits();
    this.sfx.setSiren(false);
  };

  PoliceSystem.prototype.targetCarCount = function () {
    if (this.stars === 0) return 0;
    return Math.min(this.stars, 4);
  };

  PoliceSystem.prototype.targetOfficerCount = function (onFoot) {
    if (this.stars === 0) return 0;
    if (!onFoot) return 0;
    return Math.min(this.stars, 3);
  };

  PoliceSystem.prototype.syncUnits = function () {
    var self = this;
    // police cars
    var want = this.targetCarCount();
    while (this.cars.length < want) {
      var model = window.SB.makeCarModel(0x1c2f4d, { police: true });
      var edge = U.pick(this.rng, [{ x: -300, z: 0 }, { x: 300, z: 0 }, { x: 0, z: -300 }, { x: 0, z: 260 }]);
      model.position.set(edge.x + U.range(this.rng, -20, 20), 0, edge.z + U.range(this.rng, -20, 20));
      this.scene.add(model);
      this.cars.push({ model: model, speed: 0, angle: 0, flash: 0 });
    }
    while (this.cars.length > want) {
      var c = this.cars.pop();
      this.scene.remove(c.model);
    }
  };

  PoliceSystem.prototype.spawnOfficer = function (x, z) {
    var model = window.SB.makePersonModel(0x1c2f4d, U.pick(this.rng, window.SB.PED_SKINS), { police: true });
    model.position.set(x, 0, z);
    this.scene.add(model);
    this.officers.push({ model: model, phase: 0, hp: 100, dead: false });
  };

  PoliceSystem.prototype.update = function (dt, player, playerCar) {
    var self = this;
    var px = player.x, pz = player.z;
    var inCar = playerCar.active;

    // wanted decay: stay quiet and out of sight and the heat drops
    if (this.stars > 0) {
      var nearest = this.nearestUnitDist(px, pz);
      if (nearest > 55) {
        this.quietTime += dt;
        if (this.quietTime > C.wantedDecayDelay) {
          this.decayTimer += dt;
          if (this.decayTimer > C.wantedDecayStep) {
            this.decayTimer = 0;
            this.stars--;
            window.SB.game.hud.toast('Heat cooling off — wanted level ' + this.stars, 'good');
            this.syncUnits();
            this.sfx.setSiren(this.stars > 0);
          }
        }
      } else {
        this.quietTime = 0;
        this.decayTimer = 0;
      }
    }

    // officers on foot (only while the player is on foot)
    var wantOff = this.targetOfficerCount(!inCar);
    while (this.officers.length < wantOff) {
      var a = this.rng() * Math.PI * 2;
      this.spawnOfficer(px + Math.sin(a) * 45, pz + Math.cos(a) * 45);
    }
    while (this.officers.length > wantOff) {
      var o = this.officers.pop();
      this.scene.remove(o.model);
    }

    // police cars chase
    this.cars.forEach(function (car) {
      var m = car.model;
      var dx = px - m.position.x, dz = pz - m.position.z;
      var dist = Math.hypot(dx, dz);
      var targetAngle = Math.atan2(dx, dz);
      var speedTarget = dist > 90 ? 30 : (dist > 14 ? 26 : 16);
      // ease off when very close so they ram instead of orbiting
      if (dist < 5) speedTarget = 12;
      car.speed = U.damp(car.speed, speedTarget, 1.2, dt);
      m.rotation.y = U.lerpAngle(m.rotation.y, targetAngle, U.clamp(dt * 2.2, 0, 1));
      var nx = m.position.x + Math.sin(m.rotation.y) * car.speed * dt;
      var nz = m.position.z + Math.cos(m.rotation.y) * car.speed * dt;
      var res = window.SB.collideCircle(self.world.colliders, nx, nz, 2.2);
      m.position.x = res.x; m.position.z = res.z;
      m.userData.wheels.forEach(function (w) { w.rotation.x += car.speed * dt * 2; });
      // light bar flash
      car.flash += dt * 10;
      if (m.userData.lightBar) {
        m.userData.lightBar[0].material.color.setHex(Math.sin(car.flash) > 0 ? 0x2266ff : 0x113366);
        m.userData.lightBar[1].material.color.setHex(Math.sin(car.flash) > 0 ? 0x661111 : 0xff2222);
      }
      // ramming the player car
      if (inCar && dist < 4.6) {
        playerCar.speed *= 0.82;
        player.damage(6 * dt, 'ram');
        if (self.rng() < dt * 2) self.sfx.crash();
      }
    });

    // officers chase on foot
    this.officers.forEach(function (off) {
      if (off.dead) return;
      var m = off.model;
      var dx = px - m.position.x, dz = pz - m.position.z;
      var dist = Math.hypot(dx, dz);
      var targetAngle = Math.atan2(dx, dz);
      m.rotation.y = U.lerpAngle(m.rotation.y, targetAngle, U.clamp(dt * 8, 0, 1));
      var sp = dist > 30 ? 7.5 : 6.2;
      m.position.x += Math.sin(m.rotation.y) * sp * dt;
      m.position.z += Math.cos(m.rotation.y) * sp * dt;
      var res = window.SB.collideCircle(self.world.footColliders, m.position.x, m.position.z, 0.5);
      m.position.x = res.x; m.position.z = res.z;
      off.phase += dt * sp * 3.2;
      window.SB.animateWalk(m, off.phase, 1);
    });

    // shooting at 3+ stars: officers take pot-shots
    if (this.stars >= 3 && !inCar) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && this.officers.length > 0) {
        this.shootTimer = U.range(this.rng, 1.2, 2.2);
        var shooter = this.officers[0];
        var d = Math.hypot(shooter.model.position.x - px, shooter.model.position.z - pz);
        if (d < 30) {
          this.sfx.shot();
          if (this.rng() < 0.35) player.damage(8, 'shot');
          window.SB.game.combat.spawnTracer(shooter.model.position, { x: px, y: 1.2, z: pz }, 0xff5533);
        }
      }
    }

    // bust check
    var busting = false;
    if (!inCar) {
      this.officers.forEach(function (off) {
        if (off.dead) return;
        var d = Math.hypot(off.model.position.x - px, off.model.position.z - pz);
        if (d < 1.7) busting = true;
      });
    } else if (this.stars >= 2 && Math.abs(playerCar.speed) < 1.2) {
      var near = false;
      this.cars.forEach(function (car) {
        var d = Math.hypot(car.model.position.x - px, car.model.position.z - pz);
        if (d < 7) near = true;
      });
      busting = near;
    }
    if (busting && this.stars > 0) {
      this.bustTimer += dt;
      window.SB.game.hud.showBustMeter(this.bustTimer / 2.2);
      if (this.bustTimer > 2.2) {
        this.bustTimer = 0;
        this.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      window.SB.game.hud.showBustMeter(0);
    }
  };

  PoliceSystem.prototype.nearestUnitDist = function (x, z) {
    var best = 1e9;
    this.cars.forEach(function (c) {
      best = Math.min(best, Math.hypot(c.model.position.x - x, c.model.position.z - z));
    });
    this.officers.forEach(function (o) {
      best = Math.min(best, Math.hypot(o.model.position.x - x, o.model.position.z - z));
    });
    return best;
  };

  window.SB.PoliceSystem = PoliceSystem;
})();
