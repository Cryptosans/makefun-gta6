// pedestrians.js — people of Solara Bay: a low-poly person model, ambient
// sidewalk walkers who flee trouble, and the Dock Rats gang for mission 4.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  function makePersonModel(shirt, skin, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var pantsMat = new THREE.MeshLambertMaterial({ color: opts.pants || 0x2c3e50 });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirtMat);
    torso.position.y = 1.18; torso.castShadow = true; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
    head.position.y = 1.82; head.castShadow = true; g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshLambertMaterial({ color: opts.hair || 0x2a1c10 }));
    hair.position.y = 1.86; g.add(hair);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), pantsMat);
    legL.position.set(-0.16, 0.39, 0); g.add(legL);
    var legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirtMat);
    armL.position.set(-0.42, 1.2, 0); g.add(armL);
    var armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
    if (opts.gang) {
      var band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.38),
        new THREE.MeshBasicMaterial({ color: 0xd21f1f }));
      band.position.y = 1.42; g.add(band);
    }
    if (opts.police) {
      var vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.38),
        new THREE.MeshLambertMaterial({ color: 0x1c2f4d }));
      vest.position.y = 1.22; g.add(vest);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
        new THREE.MeshLambertMaterial({ color: 0x1c2f4d }));
      cap.position.y = 2.02; g.add(cap);
    }
    g.userData.parts = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
    return g;
  }

  function animateWalk(model, phase, speed01) {
    var p = model.userData.parts;
    var s = Math.sin(phase) * 0.7 * speed01;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8;
    p.armR.rotation.x = s * 0.8;
  }

  // ---- ambient pedestrians ----
  function PedSystem(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.peds = [];
    this.gang = [];
    for (var i = 0; i < C.pedCount; i++) this.spawnAmbient();
  }

  PedSystem.prototype.randomSidewalk = function () {
    // pick a road, walk along its sidewalk
    var c = U.pick(this.rng, C.roadCoords);
    var along = U.range(this.rng, -280, 280);
    var off = C.roadWidth / 2 + 2.5;
    if (this.rng() < 0.5) return { x: c + (this.rng() < 0.5 ? off : -off), z: along, axis: 'z' };
    return { x: along, z: c + (this.rng() < 0.5 ? off : -off), axis: 'x' };
  };

  PedSystem.prototype.spawnAmbient = function () {
    var s = this.randomSidewalk();
    var shirt = U.pick(this.rng, window.SB.PED_SHIRTS);
    var skin = U.pick(this.rng, window.SB.PED_SKINS);
    var model = makePersonModel(shirt, skin);
    model.position.set(s.x, 0, s.z);
    this.scene.add(model);
    this.peds.push({
      model: model, axis: s.axis, dir: this.rng() < 0.5 ? 1 : -1,
      speed: U.range(this.rng, 1.1, 2.1), phase: this.rng() * 6,
      flee: 0, fleeX: 0, fleeZ: 0, hp: 100, dead: false,
      name: U.pick(this.rng, window.SB.FIRST_NAMES) + ' ' + U.pick(this.rng, window.SB.LAST_NAMES),
    });
  };

  // A driver whose car was stolen runs away from the player.
  PedSystem.prototype.spawnFleeingDriver = function (x, z) {
    var model = makePersonModel(U.pick(this.rng, window.SB.PED_SHIRTS), U.pick(this.rng, window.SB.PED_SKINS));
    model.position.set(x, 0, z);
    this.scene.add(model);
    this.peds.push({
      model: model, axis: 'z', dir: 1, speed: 3.2, phase: 0,
      flee: 6, fleeX: x, fleeZ: z, hp: 100, dead: false,
      name: 'Driver', driver: true,
    });
  };

  PedSystem.prototype.fleeFrom = function (x, z, radius) {
    this.peds.forEach(function (p) {
      if (p.dead) return;
      var d = Math.hypot(p.model.position.x - x, p.model.position.z - z);
      if (d < radius) { p.flee = 3; p.fleeX = x; p.fleeZ = z; }
    });
  };

  PedSystem.prototype.update = function (dt) {
    var self = this;
    this.peds.forEach(function (p) {
      if (p.dead) return;
      var m = p.model;
      var speed = p.speed;
      var targetAngle = m.rotation.y;
      if (p.flee > 0) {
        p.flee -= dt;
        speed = 4.6;
        var fx = m.position.x - p.fleeX, fz = m.position.z - p.fleeZ;
        targetAngle = Math.atan2(fx, fz);
        if (Math.hypot(fx, fz) < 0.01) targetAngle = m.rotation.y;
      } else {
        if (p.axis === 'z') {
          targetAngle = p.dir > 0 ? 0 : Math.PI;
          var nz = m.position.z + p.dir * speed * dt;
          if (nz > 300 || nz < -300) { p.dir *= -1; }
          m.position.z = U.clamp(nz, -305, 305);
        } else {
          targetAngle = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          var nx = m.position.x + p.dir * speed * dt;
          if (nx > 300 || nx < -300) { p.dir *= -1; }
          m.position.x = U.clamp(nx, -305, 305);
        }
        // random u-turns at intersections
        if (self.rng() < dt * 0.02) p.dir *= -1;
      }
      m.rotation.y = U.lerpAngle(m.rotation.y, targetAngle, U.clamp(dt * 8, 0, 1));
      if (p.flee > 0) {
        m.position.x += Math.sin(m.rotation.y) * speed * dt;
        m.position.z += Math.cos(m.rotation.y) * speed * dt;
        var res = window.SB.collideCircle(self.world.footColliders, m.position.x, m.position.z, 0.5);
        m.position.x = res.x; m.position.z = res.z;
      }
      p.phase += dt * speed * 3.2;
      animateWalk(m, p.phase, U.clamp(speed / 4, 0.3, 1));
      if (p.flee <= 0 && p.driver) {
        // driver ran far enough: despawn quietly
        p.dead = true;
        self.scene.remove(m);
      }
    });
    this.peds = this.peds.filter(function (p) { return !p.dead || p.gang; });
    // gang members
    this.gang.forEach(function (g) {
      if (g.dead) return;
      g.phase += dt * 3;
      animateWalk(g.model, g.phase, 0.5);
    });
  };

  // Dock Rats gang members for the pier mission.
  PedSystem.prototype.spawnGang = function (positions) {
    var self = this;
    this.clearGang();
    positions.forEach(function (pos) {
      var model = makePersonModel(0x3a3d42, U.pick(self.rng, window.SB.PED_SKINS), { gang: true });
      model.position.set(pos.x, 1.3, pos.z); // standing on the pier deck
      self.scene.add(model);
      self.gang.push({ model: model, hp: 100, dead: false, phase: 0, x: pos.x, z: pos.z, name: 'Dock Rat' });
    });
  };

  PedSystem.prototype.clearGang = function () {
    var self = this;
    this.gang.forEach(function (g) { self.scene.remove(g.model); });
    this.gang = [];
  };

  PedSystem.prototype.gangAlive = function () {
    return this.gang.filter(function (g) { return !g.dead; }).length;
  };

  window.SB.makePersonModel = makePersonModel;
  window.SB.animateWalk = animateWalk;
  window.SB.PedSystem = PedSystem;
})();
