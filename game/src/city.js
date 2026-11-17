// Solara Bay — the city itself: streets, buildings, beach, pier, landmarks.
// Everything is procedural; all textures are drawn on canvas at load time.
import * as THREE from 'three';
import { rand, randInt, pick, clamp, makeCanvas } from './utils.js';

export const PITCH = 74;          // block + road
export const GRID = 5;            // blocks per side
export const ROAD = 14;           // road width
export const HALF = (GRID * PITCH) / 2; // 185 — outer street coordinate
export const CITY_BOUND = HALF + 90;    // playable clamp incl. beach

export function streetCoords() {
  const out = [];
  for (let i = 0; i <= GRID; i++) out.push(-HALF + i * PITCH);
  return out;
}
export function isOnRoad(x, z) {
  const r = ROAD / 2 + 1.5;
  for (const s of streetCoords()) {
    if (Math.abs(x - s) < r || Math.abs(z - s) < r) return true;
  }
  return false;
}

function asphaltTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#2b2e36'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33a';
  g.fillRect(60, 8, 3, 44); g.fillRect(60, 76, 3, 44);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(6, 0, 2, 128); g.fillRect(120, 0, 2, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function facadeTexture(base, lit) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let y = 22; y < 244; y += 26) {
    for (let x = 12; x < 116; x += 26) {
      const on = Math.random() < lit;
      g.fillStyle = on ? '#ffd98a' : 'rgba(20,28,48,0.85)';
      g.fillRect(x, y, 16, 18);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, 16, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDING_COLORS = ['#c96f4a', '#d9a05b', '#7fa3b8', '#b87f9e', '#8fa98f', '#c9b458', '#9a8fc9', '#e08a6d', '#6fa8a0', '#d97b7b'];

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.buildings = [];
    this.streetLamps = [];
    this.water = null;
    this.pier = null;
    this.landmarks = {
      chopShop: { x: -111, z: -37, name: 'Chop Shop' },
      bank: { x: 37, z: 74, name: 'Solara National Bank' },
      warehouse: { x: -111, z: 148, name: 'Delacroix Warehouse' },
      pier: { x: 252, z: 0, name: 'Marina Pier' },
      docks: { x: -148, z: 148, name: 'Solara Docks' },
      plaza: { x: 0, z: 0, name: 'Solara Plaza' },
    };
    this._buildLights();
    this._buildGround();
    this._buildRoads();
    this._buildBuildings();
    this._buildProps();
    this._buildBeach();
  }

  _buildLights() {
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 600;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x3a2f26, 1.1));
    this.scene.fog = new THREE.Fog(0xbfd9e8, 320, 700);
    this.scene.background = new THREE.Color(0x87b5d6);
  }

  _buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x9aa08e }),
    );
    g.rotation.x = -Math.PI / 2; g.position.set(40, -0.05, 0);
    g.receiveShadow = true;
    this.scene.add(g);
    // Sidewalk-coloured base under the whole city grid.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + ROAD, HALF * 2 + ROAD),
      new THREE.MeshLambertMaterial({ color: 0xb9b3a4 }),
    );
    base.rotation.x = -Math.PI / 2; base.position.y = 0;
    base.receiveShadow = true;
    this.scene.add(base);
  }

  _buildRoads() {
    const tex = asphaltTexture();
    const len = HALF * 2 + ROAD;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    for (const s of streetCoords()) {
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD), mat.clone());
        road.material.map = tex.clone();
        road.material.map.needsUpdate = true;
        road.material.map.repeat.set(len / 14, 1);
        road.rotation.x = -Math.PI / 2;
        if (!horizontal) road.rotation.z = Math.PI / 2;
        road.position.set(horizontal ? 0 : s, 0.02, horizontal ? s : 0);
        road.receiveShadow = true;
        this.scene.add(road);
      }
    }
  }

  _buildBuildings() {
    const facades = [
      facadeTexture('#c96f4a', 0.35),
      facadeTexture('#7fa3b8', 0.3),
      facadeTexture('#d9a05b', 0.4),
      facadeTexture('#8fa98f', 0.25),
    ];
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4238 });
    const geoBox = new THREE.BoxGeometry(1, 1, 1);
    const blockCenters = [];
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        blockCenters.push({
          x: -HALF + i * PITCH + PITCH / 2,
          z: -HALF + j * PITCH + PITCH / 2,
        });
      }
    }
    for (const b of blockCenters) {
      // Plaza at the very centre stays open.
      if (Math.abs(b.x) < 1 && Math.abs(b.z) < 1) { this._buildPlaza(b.x, b.z); continue; }
      const n = randInt(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rand(16, 30), d = rand(16, 30);
        const h = pick([rand(10, 18), rand(18, 32), rand(32, 52)]);
        const ox = rand(-14, 14), oz = rand(-14, 14);
        const x = b.x + ox, z = b.z + oz;
        const mat = new THREE.MeshLambertMaterial({ map: pick(facades) });
        const m = new THREE.Mesh(geoBox, mat);
        m.scale.set(w, h, d);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
        // Rooftop box.
        const roof = new THREE.Mesh(geoBox, roofMat);
        roof.scale.set(w * 0.35, rand(2, 4), d * 0.35);
        roof.position.set(x + rand(-4, 4), h + roof.scale.y / 2, z + rand(-4, 4));
        this.scene.add(roof);
        // Neon sign strip on some towers.
        if (h > 30 && Math.random() < 0.5) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.7, 1.6, 0.4),
            new THREE.MeshBasicMaterial({ color: pick([0xff2e88, 0x35e0ff, 0xffd75e, 0x7dff9a]) }),
          );
          sign.position.set(x, h - 2, z + d / 2 + 0.3);
          this.scene.add(sign);
        }
        this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        this.buildings.push(m);
      }
    }
  }

  _buildPlaza(bx, bz) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xcfc4a8 });
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), mat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(bx, 0.03, bz);
    this.scene.add(plaza);
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 8, 1.6, 20),
      new THREE.MeshLambertMaterial({ color: 0x7fb3c9 }),
    );
    fountain.position.set(bx, 0.8, bz);
    fountain.castShadow = true;
    this.scene.add(fountain);
    this.colliders.push({ minX: bx - 8, maxX: bx + 8, minZ: bz - 8, maxZ: bz + 8 });
  }

  _buildProps() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const streets = streetCoords();
    for (const s of streets) {
      for (let t = -HALF + 20; t <= HALF - 20; t += 46) {
        // Palm trees along the road edges.
        if (Math.random() < 0.75) {
          const px = s + pick([-1, 1]) * (ROAD / 2 + 3);
          const pz = t + rand(-6, 6);
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
          trunk.position.set(px, 3.5, pz);
          trunk.castShadow = true;
          const crown = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), leafMat);
          crown.scale.y = 0.55;
          crown.position.set(px, 7.4, pz);
          crown.castShadow = true;
          this.scene.add(trunk, crown);
        }
        // Street lamps at intersections.
        if (Math.random() < 0.5) {
          const lx = s + (ROAD / 2 + 1.2);
          const lz = t;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
          pole.position.set(lx, 3, lz);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampGlow);
          bulb.position.set(lx, 6.2, lz);
          this.scene.add(pole, bulb);
          this.streetLamps.push(bulb);
        }
      }
    }
  }

  _buildBeach() {
    // Sand strip east of the city.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(80, HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0xe8d49a }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(HALF + 48, 0.01, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);
    // The bay itself.
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, HALF * 2 + 220),
      new THREE.MeshPhongMaterial({ color: 0x1f7fa8, transparent: true, opacity: 0.85, shininess: 120 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(HALF + 200, 0.05, 0);
    this.scene.add(this.water);
    // Marina pier with a yacht at the end.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    this.pier = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 10), pierMat);
    this.pier.position.set(HALF + 88 + 30, 0.6, 0);
    this.pier.castShadow = true;
    this.scene.add(this.pier);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(16, 3, 5),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    hull.position.set(268, 1.6, 0);
    hull.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(9, 2.4, 3.6),
      new THREE.MeshLambertMaterial({ color: 0x27435e }),
    );
    cabin.position.set(268, 4.2, 0);
    this.scene.add(hull, cabin);
  }

  randomRoadPoint() {
    const streets = streetCoords();
    const horizontal = Math.random() < 0.5;
    const s = pick(streets);
    const t = rand(-HALF + 10, HALF - 10);
    return horizontal ? { x: t, z: s + rand(-3, 3) } : { x: s + rand(-3, 3), z: t };
  }

  randomSidewalkPoint() {
    const streets = streetCoords();
    const horizontal = Math.random() < 0.5;
    const s = pick(streets);
    const t = rand(-HALF + 10, HALF - 10);
    const off = (ROAD / 2 + rand(2, 6)) * pick([-1, 1]);
    return horizontal ? { x: t, z: s + off } : { x: s + off, z: t };
  }

  clampToWorld(p, margin = 6) {
    p.x = clamp(p.x, -HALF - margin, CITY_BOUND);
    p.z = clamp(p.z, -HALF - margin, HALF + margin);
  }
}
