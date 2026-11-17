// vehicles.js — car models built from boxes, traffic that drives the road graph,
// parked cars to steal, and the player's arcade driving physics.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;

  var WHEEL_GEO = null;
  function wheelGeo() {
    if (!WHEEL_GEO) WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    return WHEEL_GEO;
  }

  // A low-poly car: body, cabin, wheels, lights. Returns a Group with .userData.
  function makeCarModel(color, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x2a3d4d });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
    cabin.position.set(0, 1.18, -0.25); cabin.castShadow = true; g.add(cabin);
    var hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.0), bodyMat);
    hood.position.set(0, 0.98, 1.55); g.add(hood);
    var wg = wheelGeo();
    var wm = new THREE.MeshLambertMaterial({ color: 0x16181c });
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wg, wm);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.42, p[1]);
      w.castShadow = true;
      g.add(w); wheels.push(w);
    });
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    [-0.6, 0.6].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
      h.position.set(x, 0.72, 2.22); g.add(h);
    });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
    [-0.6, 0.6].forEach(function (x) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
      t.position.set(x, 0.72, -2.22); g.add(t);
    });
    if (opts.police) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      bar.position.set(0, 1.55, -0.25); g.add(bar);
      var bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar2.position.set(0, 1.55, 0.15); g.add(bar2);
      g.userData.lightBar = [bar, bar2];
      var star = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      star.position.set(0, 0.95, 0.0); star.rotation.y = Math.PI / 2; g.add(star);
    }
    g.userData.wheels = wheels;
    g.userData.color = color;
    return g;
  }

  // ---- traffic ----
  function TrafficSystem(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    this.spawnParked();
    this.spawnTraffic();
  }

  TrafficSystem.prototype.randomNode = function () {
    return U.pick(this.rng, this.world.roadNodes);
  };

  TrafficSystem.prototype.spawnTraffic = function () {
    for (var i = 0; i < C.trafficCount; i++) {
      var node = this.randomNode();
      var next = U.pick(this.rng, this.world.neighbors(node));
      var color = U.pick(this.rng, window.SB.CAR_COLORS);
      var model = makeCarModel(color);
      model.position.set(node.x, 0, node.z);
      this.scene.add(model);
      this.cars.push({
        model: model, node: node, next: next, speed: U.range(this.rng, 7, 11),
        maxSpeed: U.range(this.rng, 7, 12), wait: 0, color: color,
        name: U.pick(this.rng, window.SB.CAR_NAMES), driver: true,
      });
    }
  };

  TrafficSystem.prototype.spawnParked = function () {
    var spots = [
      { x: -88, z: 120, a: 0 }, { x: 88, z: -40, a: Math.PI / 2 }, { x: -8, z: -168, a: 0 },
      { x: 168, z: 40, a: Math.PI / 2 }, { x: -168, z: -88, a: 0 }, { x: 8, z: 168, a: Math.PI / 2 },
      { x: 248, z: -120, a: 0 }, { x: -248, z: 40, a: Math.PI / 2 }, { x: 120, z: 248, a: 0 },
    ];
    var self = this;
    spots.forEach(function (s) {
      var color = U.pick(self.rng, window.SB.CAR_COLORS);
      var model = makeCarModel(color);
      model.position.set(s.x, 0, s.z);
      model.rotation.y = s.a;
      self.scene.add(model);
      self.parked.push({
        model: model, x: s.x, z: s.z, angle: s.a, color: color,
        name: U.pick(self.rng, window.SB.CAR_NAMES), taken: false,
      });
    });
  };

  TrafficSystem.prototype.update = function (dt, playerCar) {
    var self = this;
    this.cars.forEach(function (car) {
      if (car.wait > 0) { car.wait -= dt; return; }
      var dx = car.next.x - car.model.position.x;
      var dz = car.next.z - car.model.position.z;
      var dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        // reached the node: pick a new one, sometimes wait at the intersection
        car.node = car.next;
        var nbs = self.world.neighbors(car.node);
        car.next = U.pick(self.rng, nbs);
        if (self.rng() < 0.22) car.wait = U.range(self.rng, 1, 3);
        return;
      }
      var targetAngle = Math.atan2(dx, dz);
      car.model.rotation.y = U.lerpAngle(car.model.rotation.y, targetAngle, U.clamp(dt * 6, 0, 1));
      // slow down for a car ahead
      var speed = car.maxSpeed;
      self.cars.forEach(function (other) {
        if (other === car) return;
        var odx = other.model.position.x - car.model.position.x;
        var odz = other.model.position.z - car.model.position.z;
        var od = Math.hypot(odx, odz);
        if (od < 11 && Math.abs(U.angleDiff(car.model.rotation.y, Math.atan2(odx, odz))) < 0.7) speed = Math.min(speed, 3);
      });
      if (playerCar && playerCar.active) {
        var pdx = playerCar.x - car.model.position.x;
        var pdz = playerCar.z - car.model.position.z;
        if (Math.hypot(pdx, pdz) < 10 && Math.abs(U.angleDiff(car.model.rotation.y, Math.atan2(pdx, pdz))) < 0.7) speed = Math.min(speed, 2.5);
      }
      car.speed = U.damp(car.speed, speed, 2, dt);
      car.model.position.x += Math.sin(car.model.rotation.y) * car.speed * dt;
      car.model.position.z += Math.cos(car.model.rotation.y) * car.speed * dt;
      car.model.userData.wheels.forEach(function (w) { w.rotation.x += car.speed * dt * 2; });
    });
  };

  // Nearest drivable car (parked or traffic) within range of a point.
  TrafficSystem.prototype.nearestCar = function (x, z, range) {
    var best = null, bestD = range;
    this.parked.forEach(function (p) {
      if (p.taken) return;
      var d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = { kind: 'parked', ref: p, x: p.x, z: p.z, angle: p.angle, name: p.name, color: p.color, model: p.model }; }
    });
    this.cars.forEach(function (c) {
      var d = Math.hypot(c.model.position.x - x, c.model.position.z - z);
      if (d < bestD) { bestD = d; best = { kind: 'traffic', ref: c, x: c.model.position.x, z: c.model.position.z, angle: c.model.rotation.y, name: c.name, color: c.color, model: c.model }; }
    });
    return best;
  };

  // Steal a traffic car: its driver bails and flees (handled by pedestrians).
  TrafficSystem.prototype.removeTrafficCar = function (car) {
    var i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.model);
  };

  // ---- player driving physics (arcade) ----
  function PlayerCar(model) {
    this.model = model;
    this.active = false;
    this.x = 0; this.z = 0; this.angle = 0;
    this.speed = 0;
    this.steer = 0;
    this.color = 0xffffff;
    this.name = '';
  }

  PlayerCar.prototype.enter = function (x, z, angle, color, name) {
    this.active = true;
    this.x = x; this.z = z; this.angle = angle;
    this.speed = 0; this.steer = 0;
    this.color = color; this.name = name;
    this.model.visible = true;
    this.model.position.set(x, 0, z);
    this.model.rotation.y = angle;
  };

  PlayerCar.prototype.exit = function () { this.active = false; this.model.visible = false; };

  PlayerCar.prototype.update = function (dt, input, world, onCrash) {
    if (!this.active) return;
    var fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    var turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (fwd > 0) this.speed += C.carAccel * dt;
    else if (fwd < 0) {
      if (this.speed > 0.5) this.speed -= C.carBrake * dt;
      else this.speed -= C.carAccel * 0.5 * dt;
    } else {
      this.speed = U.damp(this.speed, 0, 1.6, dt);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = U.clamp(this.speed, -C.carMaxReverse, C.carMaxSpeed);
    var speedFactor = U.clamp(Math.abs(this.speed) / 12, 0, 1);
    this.steer = U.damp(this.steer, turn * C.carTurn * speedFactor, 8, dt);
    this.angle += this.steer * dt * (this.speed >= 0 ? 1 : -1);
    var nx = this.x + Math.sin(this.angle) * this.speed * dt;
    var nz = this.z + Math.cos(this.angle) * this.speed * dt;
    var res = window.SB.collideCircle(world.colliders, nx, nz, 2.2);
    if (res.hit && Math.abs(this.speed) > 6) {
      onCrash(Math.abs(this.speed));
      this.speed *= -0.25;
    }
    this.x = U.clamp(res.x, -314, 314);
    this.z = U.clamp(res.z, -314, 314);
    this.model.position.set(this.x, 0, this.z);
    this.model.rotation.y = this.angle;
    // body roll + wheel spin
    this.model.rotation.z = -this.steer * 0.03 * (this.speed >= 0 ? 1 : -1);
    this.model.userData.wheels.forEach(function (w) { w.rotation.x += this.speed * dt * 2; }, this);
  };

  window.SB.makeCarModel = makeCarModel;
  window.SB.TrafficSystem = TrafficSystem;
  window.SB.PlayerCar = PlayerCar;
})();
