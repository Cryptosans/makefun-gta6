// Solara Bay — the city itself: ground, road grid, buildings with lit
// window facades, beach and bay water, pier, lamps and palms. Everything is
// procedural geometry; no textures or models are loaded from anywhere.
import * as THREE from 'three';
import { CONFIG, ROAD_LINES } from './config.js';
import { rand, randInt, pick } from './utils.js';

const PALETTE = {
  ground: 0x3d5a3a,
  road: 0x2b2e33,
  sidewalk: 0x8a8d90,
  sand: 0xd9c28a,
  water: 0x1d6f8e,
  pier: 0x7a5c38,
};

const FACADE_COLORS = ['#5a6b7d', '#7d6a5a', '#4a5d4f', '#6d5a7d', '#7d5a5a', '#54606e', '#8a7a5a'];
const ROOF_COLORS = [0x3a3f45, 0x4a3a30, 0x333a44, 0x40342a];

/** A canvas texture of lit windows on a facade, tinted per building. */
function facadeTexture(baseColor) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so flat boxes read as towers.
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = Math.random() < 0.42;
      g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#1c2430';
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flatPlane(w, d, color, x, z, y = 0.02) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = false;
  return m;
}

/** Build the whole city into the scene. Returns colliders and spawn data. */
export function buildCity(scene) {
  const half = CONFIG.world.halfSize;
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'SolaraBayCity';

  // Base ground, then roads and sidewalks as flat overlays.
  group.add(flatPlane(half * 2 + 120, half * 2 + 120, PALETTE.ground, 0, 0, 0));
  for (const line of ROAD_LINES) {
    group.add(flatPlane(half * 2, CONFIG.world.roadHalfWidth * 2, PALETTE.road, 0, line, 0.03));
    group.add(flatPlane(CONFIG.world.roadHalfWidth * 2, half * 2, PALETTE.road, line, 0, 0.03));
    // Centre dashes.
    for (let t = -half + 8; t < half - 8; t += 16) {
      group.add(flatPlane(6, 0.5, 0xd8d8d8, t, line, 0.05));
      group.add(flatPlane(0.5, 6, 0xd8d8d8, line, t, 0.05));
    }
  }
  // Sidewalk strips along every road.
  const sw = CONFIG.world.roadHalfWidth + 2;
  for (const line of ROAD_LINES) {
    group.add(flatPlane(half * 2, 4, PALETTE.sidewalk, 0, line - sw, 0.04));
    group.add(flatPlane(half * 2, 4, PALETTE.sidewalk, 0, line + sw, 0.04));
    group.add(flatPlane(4, half * 2, PALETTE.sidewalk, line - sw, 0, 0.04));
    group.add(flatPlane(4, half * 2, PALETTE.sidewalk, line + sw, 0, 0.04));
  }

  // Beach and bay water on the south edge.
  group.add(flatPlane(half * 2 + 120, 46, PALETTE.sand, 0, 225, 0.04));
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 400, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, 360);
  group.add(water);

  // Pier reaching into the bay.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.2, 46),
    new THREE.MeshLambertMaterial({ color: PALETTE.pier }),
  );
  pier.position.set(-108, 0.6, 232);
  group.add(pier);
  colliders.push({ minX: -113, maxX: -103, minZ: 209, maxZ: 255 });

  // Buildings: one or two per block, skipping the beach row and the plaza.
  const facadeMats = FACADE_COLORS.map(
    (c) => new THREE.MeshLambertMaterial({ map: facadeTexture(c) }),
  );
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const roofTrim = ROOF_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const blocks = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iz = -2; iz <= 2; iz++) {
      const cx = ix * CONFIG.world.gridStep;
      const cz = iz * CONFIG.world.gridStep;
      if (cz >= 180) continue; // beach row stays open
      if (ix === 0 && iz === 1) continue; // market plaza stays open
      blocks.push({ cx, cz });
    }
  }
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const { cx, cz } of blocks) {
    const count = Math.random() < 0.55 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const w = rand(20, 30);
      const d = rand(20, 30);
      const h = rand(14, 58);
      const ox = count === 1 ? 0 : (k === 0 ? -13 : 13);
      const oz = count === 1 ? 0 : (k === 0 ? -11 : 11);
      const x = cx + ox;
      const z = cz + oz;
      const mat = pick(facadeMats);
      const b = new THREE.Mesh(buildingGeo, mat);
      b.scale.set(w, h, d);
      b.position.set(x, h / 2, z);
      group.add(b);
      const roof = new THREE.Mesh(buildingGeo, pick(roofTrim));
      roof.scale.set(w + 1, 1.2, d + 1);
      roof.position.set(x, h + 0.6, z);
      group.add(roof);
      // Rooftop AC box on tall towers.
      if (h > 34) {
        const ac = new THREE.Mesh(buildingGeo, roofMat);
        ac.scale.set(5, 2.4, 4);
        ac.position.set(x + w * 0.2, h + 2.4, z - d * 0.15);
        group.add(ac);
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // Street lamps at intersections.
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
  const lampHeadMat = new THREE.MeshLambertMaterial({
    color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9,
  });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if ((lx + lz) % 144 !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, lampPoleMat);
      pole.position.set(lx + 9, 3.5, lz + 9);
      group.add(pole);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.set(lx + 9, 7.1, lz + 9);
      group.add(head);
    }
  }

  // Palms along the beach.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  for (let x = -230; x <= 230; x += 28) {
    if (Math.abs(x + 108) < 12) continue; // keep the pier clear
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x + rand(-4, 4), 3, 216 + rand(-3, 3));
    trunk.rotation.z = rand(-0.12, 0.12);
    group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(trunk.position.x, 7.4, trunk.position.z);
    group.add(leaves);
  }

  // A few inland trees for the plaza and park blocks.
  for (let i = 0; i < 16; i++) {
    const x = rand(-200, 200);
    const z = rand(-200, 160);
    if (ROAD_LINES.some((l) => Math.abs(x - l) < 11 || Math.abs(z - l) < 11)) continue;
    if (colliders.some((b) => x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3)) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.2, z);
    trunk.scale.set(0.8, 0.75, 0.8);
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), leafMat);
    leaves.position.set(x, 6, z);
    group.add(leaves);
  }

  // Downtown sign: a glowing "SOLARA BAY" billboard over the market plaza.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 128;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#101826';
  sg.fillRect(0, 0, 512, 128);
  sg.strokeStyle = '#ff5a7a';
  sg.lineWidth = 6;
  sg.strokeRect(4, 4, 504, 120);
  sg.fillStyle = '#ffd98a';
  sg.font = 'bold 64px sans-serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('SOLARA BAY', 256, 66);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 9),
    new THREE.MeshBasicMaterial({ map: signTex }),
  );
  sign.position.set(-36, 22, 30);
  sign.rotation.y = Math.PI;
  group.add(sign);
  const signPost1 = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 1), lampPoleMat);
  signPost1.position.set(-52, 11, 30);
  group.add(signPost1);
  const signPost2 = signPost1.clone();
  signPost2.position.set(-20, 11, 30);
  group.add(signPost2);

  scene.add(group);
  return { colliders, group };
}

/** A parked-car spot: on a road edge, clear of intersections. */
export function parkedCarSpots() {
  return [
    { x: -100, z: -29, heading: 0 },
    { x: -28, z: -101, heading: Math.PI / 2 },
    { x: 44, z: -101, heading: Math.PI / 2 },
    { x: 116, z: -29, heading: 0 },
    { x: -172, z: 43, heading: Math.PI / 2 },
    { x: 100, z: 115, heading: 0 },
    { x: 28, z: 187, heading: Math.PI / 2 },
    { x: -144, z: 115, heading: 0 },
  ];
}

/** Rectangular traffic loops around city blocks, for the traffic cars. */
export function trafficLoops() {
  const loops = [];
  for (const [x0, z0, x1, z1] of [
    [-180, -180, -36, -36], [-36, -180, 108, -36], [108, -180, 180, -36],
    [-180, -36, -36, 108], [-36, -36, 108, 108], [108, -36, 180, 108],
    [-180, 108, -36, 180], [-36, 108, 108, 180], [108, 108, 180, 180],
    [-180, -180, 180, -180], [-180, 180, 180, 180],
  ]) {
    loops.push([
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ]);
  }
  return loops;
}
