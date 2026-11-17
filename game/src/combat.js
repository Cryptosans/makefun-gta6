// combat.js — fists and the pistol: punching, raycast shooting, tracers,
// muzzle flash and damage against pedestrians, gang members and officers.
(function () {
  'use strict';
  var U = window.SB.util;

  function Combat(scene, sfx, game) {
    this.scene = scene;
    this.sfx = sfx;
    this.game = game;
    this.raycaster = new THREE.Raycaster();
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.tracers = [];
    this.muzzle = new THREE.PointLight(0xffcc66, 0, 18);
    this.scene.add(this.muzzle);
    this.muzzleTimer = 0;
  }

  Combat.prototype.update = function (dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.intensity = 0;
    }
    for (var i = this.tracers.length - 1; i >= 0; i--) {
      var t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  };

  Combat.prototype.spawnTracer = function (from, to, color) {
    var geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    var mat = new THREE.LineBasicMaterial({ color: color || 0xffee88, transparent: true, opacity: 0.9 });
    var line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line: line, life: 0.12 });
  };

  Combat.prototype.punch = function (player) {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.45;
    this.sfx.punch();
    player.punchAnim = 0.3;
    var game = this.game;
    var px = player.x, pz = player.z;
    var fx = Math.sin(player.angle), fz = Math.cos(player.angle);
    var hitSomething = false;
    function tryHit(list, onKill) {
      list.forEach(function (e) {
        if (e.dead) return;
        var m = e.model;
        var dx = m.position.x - px, dz = m.position.z - pz;
        var d = Math.hypot(dx, dz);
        if (d < 2.4 && (dx * fx + dz * fz) > 0) {
          e.hp -= 50;
          hitSomething = true;
          if (e.hp <= 0) { e.dead = true; onKill(e); }
        }
      });
    }
    tryHit(game.peds.peds, function (e) {
      game.peds.scene.remove(e.model);
      game.police.addWanted(1, 'Assault on a civilian');
      game.peds.fleeFrom(px, pz, 30);
    });
    tryHit(game.peds.gang, function (e) {
      game.peds.scene.remove(e.model);
      game.missions.onGangDown();
    });
    tryHit(game.police.officers, function (e) {
      game.police.scene.remove(e.model);
      game.police.addWanted(1, 'Assault on an officer');
    });
    if (hitSomething) game.hud.flashHit();
  };

  // Shoot from the camera centre toward the aim point.
  Combat.prototype.shoot = function (player, camera) {
    if (this.fireCooldown > 0 || player.inCar) return;
    this.fireCooldown = 0.34;
    this.sfx.shot();
    var origin = new THREE.Vector3(player.x, 1.55 + player.y, player.z);
    // aim slightly ahead of the player, toward where the camera looks
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    this.raycaster.set(origin, dir);
    this.raycaster.far = 60;
    var game = this.game;
    var targets = [];
    game.peds.peds.forEach(function (p) { if (!p.dead) targets.push({ obj: p.model, ref: p, kind: 'ped' }); });
    game.peds.gang.forEach(function (g) { if (!g.dead) targets.push({ obj: g.model, ref: g, kind: 'gang' }); });
    game.police.officers.forEach(function (o) { if (!o.dead) targets.push({ obj: o.model, ref: o, kind: 'officer' }); });
    var meshes = [];
    targets.forEach(function (t) { t.obj.traverse(function (c) { if (c.isMesh) { c.userData._target = t; meshes.push(c); } }); });
    var hits = this.raycaster.intersectObjects(meshes, false);
    var end = origin.clone().add(dir.clone().multiplyScalar(60));
    if (hits.length > 0) {
      var h = hits[0];
      end = h.point.clone();
      var t = h.object.userData._target;
      t.ref.hp -= 34;
      this.sfx.punch();
      if (t.ref.hp <= 0 && !t.ref.dead) {
        t.ref.dead = true;
        game.peds.scene.remove(t.ref.model);
        if (t.kind === 'gang') game.missions.onGangDown();
        else if (t.kind === 'officer') game.police.addWanted(2, 'Officer down');
        else {
          game.police.addWanted(1, 'Shooting a civilian');
          game.peds.fleeFrom(player.x, player.z, 40);
        }
      } else {
        game.peds.fleeFrom(player.x, player.z, 25);
      }
    }
    // muzzle flash + tracer from the gun to the hit point
    var muzzlePos = origin.clone().add(dir.clone().multiplyScalar(0.8));
    muzzlePos.y = 1.45 + player.y;
    this.muzzle.position.copy(muzzlePos);
    this.muzzle.intensity = 2.2;
    this.muzzleTimer = 0.06;
    this.spawnTracer(muzzlePos, end, 0xffee88);
    // a stray shot in the open still draws attention
    if (game.police.stars === 0 && Math.random() < 0.3) game.police.addWanted(1, 'Shots fired');
    game.hud.flashHit();
  };

  window.SB.Combat = Combat;
})();
