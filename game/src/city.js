// city.js — builds Solara Bay: a 5x5-block procedural city on a road grid,
// with a beach and ocean along the south edge, a marina pier with a yacht,
// and a central plaza with a fountain. It also owns the collision list
// (axis-aligned boxes) and the road helpers traffic and pedestrians use.

import * as THREE from 'three';
import { rand, randInt, pick, hashString } from './utils.js';

export const GRID_LINES = [-100, -50, 0, 50, 100];
export const ROAD_HALF = 7;
export const CITY_HALF = 125;
export const BEACH_Z = 112;
export const WATER_Z = 130;
export const BLOCK = 50;

const BUILDING_PALETTE = [
  0xd8c9a3, 0xc9a06a, 0xb98d5f, 0x9fb4c7, 0xc7b299,
  0xa8b8a0, 0xd0a0a0, 0x8fa3b8, 0xe0d0b0, 0xb0a890,
];
const ROOF_COLORS = [0x6b5d4f, 0x4f5d6b, 0x7a6a55, 0x5d6b5d];

// Procedural window texture: a dark facade with a grid of lit/unlit
// windows, drawn once per variant and shared by many buildings.
function makeFacadeTexture(baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = Math.random() < litRatio;
      ctx.fillStyle = lit ? '#ffe9a8' : '#20242e';
      ctx.fillRect(12 + col * 28, 14 + row * 24, 18, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.roadLines = GRID_LINES;
    this.buildingGroup = new THREE.Group();
    this.decorGroup = new THREE.Group();
    scene.add(this.buildingGroup);
    scene.add(this.decorGroup);
    this.facadeTextures = [
      makeFacadeTexture(0xd8c9a3, 0.35),
      makeFacadeTexture(0x9fb4c7, 0.3),
      makeFacadeTexture(0xc9a06a, 0.4),
      makeFacadeTexture(0xa8b8a0, 0.25),
    ];
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildPlaza();
    this._buildBeachAndPier();
    this._buildStreetProps();
  }

  _addCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  _buildGround() {
    // Base ground: warm sand-grass that reads as a coastal town.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0x8fa06b })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 40);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // City slab under the road grid.
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 24, CITY_HALF * 2 + 24),
      new THREE.MeshLambertMaterial({ color: 0x9a9a8e })
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0.0, 0);
    slab.receiveShadow = true;
    this.scene.add(slab);
  }

  _buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8d44d });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d0 });
    for (const line of GRID_LINES) {
      // North-south road strip.
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_HALF * 2), roadMat);
      ns.rotation.x = -Math.PI / 2;
      ns.position.set(line, 0.02, 0);
      ns.receiveShadow = true;
      this.scene.add(ns);
      // East-west road strip.
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, ROAD_HALF * 2), roadMat);
      ew.rotation.x = -Math.PI / 2;
      ew.position.set(0, 0.02, line);
      ew.receiveShadow = true;
      this.scene.add(ew);
      // Centre dashed line, north-south.
      for (let z = -CITY_HALF + 6; z < CITY_HALF - 4; z += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(line, 0.04, z);
        this.scene.add(dash);
      }
      // Centre dashed line, east-west.
      for (let x = -CITY_HALF + 6; x < CITY_HALF - 4; x += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.04, line);
        this.scene.add(dash);
      }
    }
    // Crosswalks at the central intersections.
    for (const x of [-50, 0, 50]) {
      for (const z of [-50, 0, 50]) {
        for (let i = -2; i <= 2; i++) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5.5), crossMat);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(x + i * 2.4, 0.04, z + ROAD_HALF - 1);
          this.scene.add(stripe);
        }
      }
    }
  }

  _buildBlocks() {
    // Blocks sit BETWEEN the road lines: with roads at -100..100 in steps
    // of 50, the block centres are at -75, -25, 25 and 75. Buildings are
    // sized so their faces stop short of the road edge (18 units from a
    // road line), keeping every road clear for traffic.
    const centres = [-75, -25, 25, 75];
    for (const cx of centres) {
      for (const cz of centres) {
        this._buildBlock(cx, cz);
      }
    }
  }

  _buildBlock(cx, cz) {
    const slots = [
      { dx: -10, dz: -10 }, { dx: 10, dz: -10 },
      { dx: -10, dz: 10 }, { dx: 10, dz: 10 },
    ];
    // The four blocks around the plaza drop the corner nearest the
    // plaza so the fountain square stays open.
    let usable = slots;
    if (Math.abs(cx) === 25 && Math.abs(cz) === 25) {
      usable = slots.filter(
        (s) => !(s.dx === -Math.sign(cx) * 10 && s.dz === -Math.sign(cz) * 10)
      );
    }
    // Shuffle which corners get a building so the skyline varies.
    const count = randInt(2, Math.min(4, usable.length));
    const chosen = usable.slice().sort(() => Math.random() - 0.5).slice(0, count);
    for (const slot of chosen) {
      const w = rand(12, 15);
      const d = rand(12, 15);
      const h = rand(9, 30);
      const x = cx + slot.dx;
      const z = cz + slot.dz;
      const key = `${cx},${cz},${slot.dx},${slot.dz}`;
      const hash = hashString(key);
      const color = BUILDING_PALETTE[hash % BUILDING_PALETTE.length];
      const tex = this.facadeTextures[hash % this.facadeTextures.length];
      const mat = new THREE.MeshLambertMaterial({ map: tex, color });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      this.buildingGroup.add(building);
      // Roof cap and a rooftop box (AC unit / stair house).
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshLambertMaterial({ color: pick(ROOF_COLORS) })
      );
      roof.position.set(x, h + 0.25, z);
      this.buildingGroup.add(roof);
      const unit = new THREE.Mesh(
        new THREE.BoxGeometry(rand(3, 5), rand(1.5, 2.5), rand(3, 5)),
        new THREE.MeshLambertMaterial({ color: 0x777777 })
      );
      unit.position.set(x + rand(-4, 4), h + 1.2, z + rand(-4, 4));
      this.buildingGroup.add(unit);
      this._addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    }
  }

  _addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5230 })
    );
    trunk.position.set(x, 1.6, z);
    trunk.castShadow = true;
    this.decorGroup.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(rand(2.2, 3.2), 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x3f7a34 })
    );
    crown.position.set(x, 4.2, z);
    crown.castShadow = true;
    this.decorGroup.add(crown);
    this._addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6);
  }

  _addPalm(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.45, 6.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a42 })
    );
    trunk.position.set(x, 3.25, z);
    trunk.rotation.z = rand(-0.08, 0.08);
    trunk.castShadow = true;
    this.decorGroup.add(trunk);
    const fronds = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 2.2, 7),
      new THREE.MeshLambertMaterial({ color: 0x2f8f4e })
    );
    fronds.position.set(x, 7.2, z);
    fronds.castShadow = true;
    this.decorGroup.add(fronds);
    this._addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
  }

  _buildPlaza() {
    // Central plaza: pale stone disc, a fountain in the middle, benches
    // and palms around the edge.
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 24, 0.3, 24),
      new THREE.MeshLambertMaterial({ color: 0xcfc4a8 })
    );
    plaza.position.set(0, 0.15, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    // Fountain basin and water.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6.6, 1.1, 20),
      new THREE.MeshLambertMaterial({ color: 0xb8b0a0 })
    );
    basin.position.set(0, 0.7, 0);
    basin.castShadow = true;
    this.scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 5.4, 0.3, 20),
      new THREE.MeshLambertMaterial({ color: 0x3fa8d8, transparent: true, opacity: 0.85 })
    );
    water.position.set(0, 1.15, 0);
    this.scene.add(water);
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 2.6, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d0c0 })
    );
    jet.position.set(0, 2.2, 0);
    this.scene.add(jet);
    const spray = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ef, transparent: true, opacity: 0.7 })
    );
    spray.position.set(0, 3.8, 0);
    this.scene.add(spray);
    this._addCollider(-7, 7, -7, 7);
    // Benches.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bx = Math.cos(angle) * 15;
      const bz = Math.sin(angle) * 15;
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.5, 1),
        new THREE.MeshLambertMaterial({ color: 0x7a5a34 })
      );
      bench.position.set(bx, 0.5, bz);
      bench.rotation.y = -angle + Math.PI / 2;
      this.decorGroup.add(bench);
    }
    // Palms ringing the plaza.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.4;
      this._addPalm(Math.cos(angle) * 21, Math.sin(angle) * 21);
    }
  }

  _buildBeachAndPier() {
    // Sand strip along the south edge.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 24, 22),
      new THREE.MeshLambertMaterial({ color: 0xe0c98f })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.03, BEACH_Z + 8);
    sand.receiveShadow = true;
    this.scene.add(sand);
    // Ocean: big animated-looking blue plane (static geometry, shimmer
    // comes from the material colour and the fog).
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 220),
      new THREE.MeshLambertMaterial({ color: 0x1e6fa8 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.4, WATER_Z + 100);
    this.scene.add(ocean);
    // A second, lighter strip right at the shoreline for a surf line.
    const surf = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 4),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ef, transparent: true, opacity: 0.6 })
    );
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(0, -0.1, WATER_Z + 1);
    this.scene.add(surf);
    // Umbrellas and palms on the sand.
    for (let i = 0; i < 6; i++) {
      const ux = -110 + i * 44 + rand(-6, 6);
      const uz = BEACH_Z + rand(3, 12);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6),
        new THREE.MeshLambertMaterial({ color: 0xdddddd })
      );
      pole.position.set(ux, 1.3, uz);
      this.decorGroup.add(pole);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: pick([0xe05a5a, 0x5a8fe0, 0xe0c95a, 0x5ae08a]) })
      );
      canopy.position.set(ux, 2.9, uz);
      this.decorGroup.add(canopy);
    }
    for (let i = 0; i < 10; i++) {
      this._addPalm(-115 + i * 25 + rand(-4, 4), BEACH_Z + rand(2, 6));
    }
    // Marina pier: wooden deck from the beach out over the water.
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.8, 46),
      new THREE.MeshLambertMaterial({ color: 0x8a6a42 })
    );
    pier.position.set(0, 0.4, WATER_Z + 20);
    pier.castShadow = true;
    pier.receiveShadow = true;
    this.scene.add(pier);
    // Pier rails.
    for (const side of [-4.8, 4.8]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.0, 46),
        new THREE.MeshLambertMaterial({ color: 0x6a4a2a })
      );
      rail.position.set(side, 1.2, WATER_Z + 20);
      this.scene.add(rail);
    }
    // Support posts under the pier.
    for (let z = WATER_Z + 2; z < WATER_Z + 42; z += 8) {
      for (const side of [-4, 4]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 2.5, 6),
          new THREE.MeshLambertMaterial({ color: 0x5d4126 })
        );
        post.position.set(side, -0.6, z);
        this.scene.add(post);
      }
    }
    this._buildYacht();
  }

  _buildYacht() {
    // "Solara Dream" — a white yacht moored at the end of the pier.
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.2, 18),
      new THREE.MeshLambertMaterial({ color: 0xf2f2ee })
    );
    hull.position.y = 0.6;
    hull.castShadow = true;
    yacht.add(hull);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: 0x2a4a6a })
    );
    deck.position.y = 1.9;
    yacht.add(deck);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2.2, 7),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    cabin.position.set(0, 3.2, -2);
    cabin.castShadow = true;
    yacht.add(cabin);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    mast.position.set(0, 6.5, 3);
    yacht.add(mast);
    yacht.position.set(9, 0.2, WATER_Z + 40);
    yacht.rotation.y = 0.15;
    this.scene.add(yacht);
    // A small speedboat beside the pier.
    const boat = new THREE.Group();
    const bHull = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1, 7),
      new THREE.MeshLambertMaterial({ color: 0xe05a3a })
    );
    bHull.position.y = 0.4;
    boat.add(bHull);
    const bSeat = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 2.5),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    bSeat.position.set(0, 1.1, -0.5);
    boat.add(bSeat);
    boat.position.set(-9, 0.1, WATER_Z + 34);
    boat.rotation.y = -0.2;
    this.scene.add(boat);
  }

  _buildStreetProps() {
    // Streetlights at every intersection.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x44484e });
    const lampMat = new THREE.MeshLambertMaterial({
      color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.7,
    });
    for (const x of GRID_LINES) {
      for (const z of GRID_LINES) {
        if (x === 0 && z === 0) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
        pole.position.set(x + ROAD_HALF + 1.2, 3.5, z + ROAD_HALF + 1.2);
        pole.castShadow = true;
        this.decorGroup.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.25), poleMat);
        arm.position.set(x + ROAD_HALF + 0.2, 6.9, z + ROAD_HALF + 1.2);
        this.decorGroup.add(arm);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
        lamp.position.set(x + ROAD_HALF - 0.8, 6.8, z + ROAD_HALF + 1.2);
        this.decorGroup.add(lamp);
      }
    }
    // Billboards on two corners of the city.
    this._addBillboard(-100, -100, 'SOLARA BAY');
    this._addBillboard(100, -100, 'DOCK 9');
  }

  _addBillboard(x, z, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 72);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('WELCOME TO THE BAY', 128, 104);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(14, 7, 0.6),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    board.position.set(x, 12, z);
    board.rotation.y = Math.PI / 4;
    board.castShadow = true;
    this.decorGroup.add(board);
    const legA = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 8.5, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    legA.position.set(x - 5, 4.2, z);
    this.decorGroup.add(legA);
    const legB = legA.clone();
    legB.position.set(x + 5, 4.2, z);
    this.decorGroup.add(legB);
    this._addCollider(x - 7, x + 7, z - 1, z + 1);
  }

  // --- helpers used by traffic, pedestrians and the player -------------

  nearestRoadLine(value) {
    let best = GRID_LINES[0];
    let bestDist = Math.abs(value - best);
    for (const line of GRID_LINES) {
      const d = Math.abs(value - line);
      if (d < bestDist) {
        bestDist = d;
        best = line;
      }
    }
    return best;
  }

  isOnRoad(x, z) {
    for (const line of GRID_LINES) {
      if (Math.abs(x - line) < ROAD_HALF + 0.5) return true;
      if (Math.abs(z - line) < ROAD_HALF + 0.5) return true;
    }
    return false;
  }

  // True when the point is in the water region (not on the pier deck).
  isInWater(x, z) {
    if (z <= WATER_Z) return false;
    if (Math.abs(x) <= 4.6 && z <= WATER_Z + 43) return false; // pier
    return true;
  }

  // Push a circle (x, z, radius) out of every building collider it
  // overlaps. Returns the corrected position.
  resolveCollisions(x, z, radius) {
    let px = x;
    let pz = z;
    for (const c of this.colliders) {
      const nearestX = Math.max(c.minX, Math.min(px, c.maxX));
      const nearestZ = Math.max(c.minZ, Math.min(pz, c.maxZ));
      const dx = px - nearestX;
      const dz = pz - nearestZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px = nearestX + (dx / d) * radius;
          pz = nearestZ + (dz / d) * radius;
        } else {
          // Dead centre inside a box: shove out along the smallest axis.
          const pushLeft = px - c.minX;
          const pushRight = c.maxX - px;
          const pushUp = pz - c.minZ;
          const pushDown = c.maxZ - pz;
          const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
          if (minPush === pushLeft) px = c.minX - radius;
          else if (minPush === pushRight) px = c.maxX + radius;
          else if (minPush === pushUp) pz = c.minZ - radius;
          else pz = c.maxZ + radius;
        }
      }
    }
    return { x: px, z: pz };
  }
}
