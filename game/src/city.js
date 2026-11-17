// city.js — builds Solara Bay: roads, blocks, towers, beach, pier, lighthouse,
// palms, streetlights and the road graph traffic drives on. All geometry is
// generated here from primitives and canvas textures; no model files exist.
(function () {
  'use strict';
  var U = window.SB.util;
  var C = window.SB.CONFIG;
  var T = window.SB.textures;

  function buildCity(scene, rng) {
    var colliders = [];   // {minX,maxX,minZ,maxZ}
    var roadNodes = [];   // {x,z} intersections
    var palms = [];
    var pickups = [];
    var world = { colliders: colliders, roadNodes: roadNodes, palms: palms, pickups: pickups };

    // ---- lights & sky ----
    var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff2d0, 1.15);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -340; sun.shadow.camera.right = 340;
    sun.shadow.camera.top = 340; sun.shadow.camera.bottom = -340;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.fog = new THREE.Fog(0xcfe0ea, 320, 720);
    scene.background = new THREE.Color(0x9fc6e2);

    // ---- ground ----
    var grassTex = T.grassTexture(rng);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(24, 24);
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(C.worldSize + 160, C.worldSize + 160),
      new THREE.MeshLambertMaterial({ map: grassTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- beach & ocean (south edge) ----
    var sandTex = T.sandTexture(rng);
    sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(10, 2);
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(C.worldSize + 160, C.waterZ - C.beachZ + 24),
      new THREE.MeshLambertMaterial({ map: sandTex })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, (C.beachZ + C.waterZ) / 2 + 6);
    sand.receiveShadow = true;
    scene.add(sand);

    var waterMat = new THREE.MeshPhongMaterial({ color: 0x2e7fa8, shininess: 90, transparent: true, opacity: 0.92 });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(C.worldSize + 400, 260), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.12, C.waterZ + 130);
    scene.add(water);
    world.water = water;
    world.waterMat = waterMat;

    // ---- roads ----
    var roadTex = T.roadTexture();
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    var roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    var sideMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
    C.roadCoords.forEach(function (c) {
      var len = C.worldSize;
      // north-south road
      var r1 = new THREE.Mesh(new THREE.PlaneGeometry(C.roadWidth, len), roadMat);
      r1.rotation.x = -Math.PI / 2;
      r1.position.set(c, 0.08, 0);
      r1.receiveShadow = true;
      scene.add(r1);
      var s1a = new THREE.Mesh(new THREE.PlaneGeometry(3, len), sideMat);
      s1a.rotation.x = -Math.PI / 2; s1a.position.set(c - C.roadWidth / 2 - 2, 0.07, 0); scene.add(s1a);
      var s1b = s1a.clone(); s1b.position.x = c + C.roadWidth / 2 + 2; scene.add(s1b);
      // east-west road
      var r2 = new THREE.Mesh(new THREE.PlaneGeometry(len, C.roadWidth), roadMat);
      r2.rotation.x = -Math.PI / 2;
      r2.position.set(0, 0.08, c);
      r2.receiveShadow = true;
      scene.add(r2);
      var s2a = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), sideMat);
      s2a.rotation.x = -Math.PI / 2; s2a.position.set(0, 0.07, c - C.roadWidth / 2 - 2); scene.add(s2a);
      var s2b = s2a.clone(); s2b.position.z = c + C.roadWidth / 2 + 2; scene.add(s2b);
    });

    // intersections = road graph nodes
    C.roadCoords.forEach(function (x) {
      C.roadCoords.forEach(function (z) { roadNodes.push({ x: x, z: z }); });
    });
    function nodeAt(x, z) {
      for (var i = 0; i < roadNodes.length; i++) if (roadNodes[i].x === x && roadNodes[i].z === z) return roadNodes[i];
      return null;
    }
    world.nodeAt = nodeAt;
    world.neighbors = function (n) {
      var out = [];
      C.roadCoords.forEach(function (c) {
        if (c !== n.x) { var a = nodeAt(c, n.z); if (a) out.push(a); }
        if (c !== n.z) { var b = nodeAt(n.x, c); if (b) out.push(b); }
      });
      return out;
    };

    // ---- buildings ----
    var facadeBases = [0xc96f4a, 0x7a9bb5, 0xd9c08a, 0x8a7f8d, 0x5f8f7b, 0xb56a6a, 0x6a7fb5, 0xc9a06a, 0x9a8fbf, 0x74a3a0];
    var facadeTexs = facadeBases.map(function (b) { return T.buildingTexture(rng, b, 6 + Math.floor(rng() * 5), 5); });
    var blockCenters = [];
    for (var bx = 0; bx < C.roadCoords.length - 1; bx++) {
      for (var bz = 0; bz < C.roadCoords.length - 1; bz++) {
        var cx = (C.roadCoords[bx] + C.roadCoords[bx + 1]) / 2;
        var cz = (C.roadCoords[bz] + C.roadCoords[bz + 1]) / 2;
        if (cz > C.beachZ - 50) continue; // beach blocks stay open
        blockCenters.push({ x: cx, z: cz });
      }
    }
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    blockCenters.forEach(function (bc, bi) {
      var distDowntown = Math.hypot(bc.x, bc.z);
      var tower = distDowntown < 130;
      var n = tower ? 2 : (rng() < 0.55 ? 3 : 2);
      for (var i = 0; i < n; i++) {
        var w = U.range(rng, 16, 30), d = U.range(rng, 16, 30);
        var h = tower ? U.range(rng, 26, 58) : U.range(rng, 8, 24);
        var ox = U.range(rng, -12, 12), oz = U.range(rng, -12, 12);
        var x = bc.x + ox, z = bc.z + oz;
        if (Math.abs(x) > 305 || Math.abs(z) > 305) return;
        var tex = U.pick(rng, facadeTexs);
        var mat = new THREE.MeshLambertMaterial({ map: tex });
        var m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        // roof cap
        var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
          new THREE.MeshLambertMaterial({ map: T.roofTexture(rng, facadeBases[bi % facadeBases.length]) }));
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // rooftop AC box on some towers
        if (tower && rng() < 0.5) {
          var ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9aa4a8 }));
          ac.scale.set(4, 2, 3); ac.position.set(x + w * 0.2, h + 1.5, z); scene.add(ac);
        }
      }
    });

    // ---- pier (south, at x = -80) ----
    var pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    var pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 90), pierMat);
    pier.position.set(-80, 0.7, C.beachZ + 42);
    pier.castShadow = true; pier.receiveShadow = true;
    scene.add(pier);
    var pierBox = { minX: -88, maxX: -72, minZ: C.beachZ - 2, maxZ: C.beachZ + 86 };
    colliders.push(pierBox);
    // The pier deck is walkable on foot (deckY) but blocks cars; pedestrians,
    // officers and the player collide against everything except the pier box.
    world.pier = { minX: pierBox.minX, maxX: pierBox.maxX, minZ: pierBox.minZ, maxZ: pierBox.maxZ, deckY: 1.3 };
    for (var p = 0; p < 6; p++) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 6), pierMat);
      post.position.set(-80 + (p % 2 ? 7 : -7), 1.5, C.beachZ + 12 + p * 14);
      scene.add(post);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      lamp.position.set(post.position.x, 4.4, post.position.z);
      scene.add(lamp);
    }
    world.pierEnd = { x: -80, z: C.beachZ + 80 };

    // ---- lighthouse (north-west hill) ----
    var lh = new THREE.Group();
    var towerMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    var tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 26, 12), towerMat);
    tower.position.y = 13; tower.castShadow = true; lh.add(tower);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0xd23b2e }));
    band.position.y = 17; lh.add(band);
    var lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lampRoom.position.y = 28; lh.add(lampRoom);
    var cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    cap.position.y = 31.5; lh.add(cap);
    lh.position.set(-252, 0, -252);
    scene.add(lh);
    colliders.push({ minX: -258, maxX: -246, minZ: -258, maxZ: -246 });
    world.lighthouse = { x: -252, z: -252 };

    // ---- palms along beach and avenues ----
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    function palm(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
      trunk.position.y = 3.5; trunk.castShadow = true; g.add(trunk);
      for (var i = 0; i < 6; i++) {
        var f = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 3.4), frondMat);
        var a = (i / 6) * Math.PI * 2;
        f.position.set(Math.sin(a) * 1.35, 7.0, Math.cos(a) * 1.35);
        f.rotation.y = a;
        f.rotation.x = 0.95; // droop down like a real palm frond
        g.add(f);
      }
      g.position.set(x, 0, z);
      scene.add(g);
      palms.push(g);
    }
    for (var px = -280; px <= 280; px += 40) { palm(px + U.range(rng, -6, 6), C.beachZ - 14); }
    for (var pz = -240; pz <= 200; pz += 80) { palm(88, pz); palm(-168, pz + 40); }

    // ---- streetlights at intersections ----
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
    var bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    roadNodes.forEach(function (n, i) {
      if (i % 2) return;
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
      pole.position.set(n.x + 9, 3.5, n.z + 9);
      scene.add(pole);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), bulbMat);
      bulb.position.set(n.x + 9, 7.1, n.z + 9);
      scene.add(bulb);
    });

    // ---- park trees (Lighthouse Hill) ----
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x4d8a3f });
    for (var t = 0; t < 14; t++) {
      var tx = U.range(rng, -300, -200), tz = U.range(rng, -300, -200);
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 6), trunkMat);
      trunk.position.set(tx, 2, tz); trunk.castShadow = true; scene.add(trunk);
      var crown = new THREE.Mesh(new THREE.SphereGeometry(U.range(rng, 3, 5), 8, 6), leafMat);
      crown.position.set(tx, 6, tz); crown.castShadow = true; scene.add(crown);
    }

    // ---- cash pickup spots (side collectibles, all on roads, never inside a block) ----
    var pickupSpots = [
      { x: 80, z: 200 }, { x: -160, z: 120 }, { x: 160, z: -40 }, { x: 0, z: -200 },
      { x: 0, z: 40 }, { x: -80, z: -120 }, { x: 240, z: 120 }, { x: -240, z: -40 },
      { x: 80, z: -240 }, { x: -80, z: 280 }, { x: 160, z: 240 }, { x: -160, z: -200 },
    ];
    pickupSpots.forEach(function (s) { pickups.push({ x: s.x, z: s.z, taken: false, mesh: null }); });

    // ---- boundary fence posts ----
    var fenceMat = new THREE.MeshLambertMaterial({ color: 0x6a7076 });
    for (var fx = -320; fx <= 320; fx += 20) {
      [-320, 320].forEach(function (fz) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), fenceMat);
        post.position.set(fx, 1.5, fz); scene.add(post);
      });
      [-320, 320].forEach(function (fx2) {
        var post2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), fenceMat);
        post2.position.set(fx2, 1.5, fx); scene.add(post2);
      });
    }

    // Spawn and mission points sit on roads or open ground, never inside a
    // building block (block centres are where the buildings stand).
    world.spawnPoints = {
      garage: { x: -84, z: 150 },
      pierKiosk: { x: -80, z: 268 },
      marina: { x: 120, z: 262 },
      hideout: { x: 164, z: -200 },
      hospital: { x: 4, z: -40 },
      start: { x: -92, z: 200 },
    };

    // Foot colliders: everything cars collide with, except the pier box —
    // on foot the pier is a walkable deck, not a wall.
    world.footColliders = colliders.filter(function (c) { return c !== pierBox; });

    return world;
  }

  // Circle (player / car) vs building AABB: push out, return true on hit.
  function collideCircle(colliders, x, z, r) {
    var hit = false;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var nx = U.clamp(x, c.minX, c.maxX);
      var nz = U.clamp(z, c.minZ, c.maxZ);
      var dx = x - nx, dz = z - nz;
      var d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          var d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push along the smallest penetration axis
          var pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
          var m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
    return { x: x, z: z, hit: hit };
  }

  function inBounds(x, z) { return Math.abs(x) < 316 && Math.abs(z) < 316; }

  // Ground height under a point: the pier deck, otherwise street level.
  function groundYAt(world, x, z) {
    var p = world.pier;
    if (p && x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) return p.deckY;
    return 0;
  }

  window.SB.buildCity = buildCity;
  window.SB.collideCircle = collideCircle;
  window.SB.inBounds = inBounds;
  window.SB.groundYAt = groundYAt;
})();
