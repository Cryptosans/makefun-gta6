// city.js — builds the procedural city: ground, ocean + beach, road grid,
// sidewalks, buildings, palms, streetlights, plaza fountain, marina + yacht.
// Exports colliders (building AABBs) and named landmark positions.
import * as THREE from 'three';
import { mulberry32, rand, pick } from './utils.js';

export const ROAD_COORDS = [-80, -40, 0, 40, 80];
export const CITY_HALF = 108;
export const BEACH_X = 100; // east edge: beach + ocean beyond x = 100

const BUILDING_COLORS = [0x8a7f72, 0x9c8f7a, 0x7a8a99, 0xb0a08a, 0x6f7f8c, 0xa89a86, 0x8f7d6b, 0x77878f];
const ROOF_COLORS = [0x5a4f45, 0x4a5a66, 0x6b5a4a, 0x3f4a55];

export function buildCity(scene) {
  const rng = mulberry32(20261118);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // --- Ground: grass-green base slab for the whole island.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(240, 1, 240),
    new THREE.MeshLambertMaterial({ color: 0x5d8a4a })
  );
  ground.position.set(0, -0.5, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // --- Ocean: big blue plane east of the beach, slightly below ground.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 260),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(175, -0.35, 0);
  group.add(ocean);
  // Animated-ish second ocean tint plane (static, cheaper than waves).
  const ocean2 = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 260),
    new THREE.MeshLambertMaterial({ color: 0x2a86b8 })
  );
  ocean2.rotation.x = -Math.PI / 2;
  ocean2.position.set(125, -0.3, 0);
  group.add(ocean2);

  // --- Beach: sand strip along the east edge.
  const beach = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.3, 240),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a })
  );
  beach.position.set(105, -0.15, 0);
  beach.receiveShadow = true;
  group.add(beach);

  // --- Roads: dark asphalt strips on the grid, with centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e33 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c84a });
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3);
  const sideMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  for (const c of ROAD_COORDS) {
    // North-south road.
    const ns = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 216), roadMat);
    ns.position.set(c, -0.05, 0); ns.receiveShadow = true; group.add(ns);
    // East-west road.
    const ew = new THREE.Mesh(new THREE.BoxGeometry(216, 0.2, 10), roadMat);
    ew.position.set(0, -0.05, c); ew.receiveShadow = true; group.add(ew);
    // Sidewalks along both roads.
    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.24, 216), sideMat);
    sw1.position.set(c + 6.2, -0.03, 0); group.add(sw1);
    const sw2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.24, 216), sideMat);
    sw2.position.set(c - 6.2, -0.03, 0); group.add(sw2);
    const sw3 = new THREE.Mesh(new THREE.BoxGeometry(216, 0.24, 2.5), sideMat);
    sw3.position.set(0, -0.03, c + 6.2); group.add(sw3);
    const sw4 = new THREE.Mesh(new THREE.BoxGeometry(216, 0.24, 2.5), sideMat);
    sw4.position.set(0, -0.03, c - 6.2); group.add(sw4);
    // Centre dashes.
    for (let d = -100; d <= 100; d += 10) {
      if (Math.abs(d % 40) < 5) continue; // skip intersections
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(c, 0.08, d); group.add(d1);
      const d2 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.5), dashMat);
      d2.position.set(d, 0.08, c); group.add(d2);
    }
  }

  // --- Buildings: 1-3 per block inside the 5x5 block grid.
  const blockCenters = [];
  for (let ix = 0; ix < 5; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      blockCenters.push({ x: -80 + ix * 40 + 20 - 20 + ix * 0, z: -80 + iz * 40 });
      // block centre x/z: roads at -80..80, blocks centred at -60,-20,20,60
    }
  }
  const centers = [];
  for (const cx of [-60, -20, 20, 60]) for (const cz of [-60, -20, 20, 60]) centers.push({ x: cx, z: cz });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const winGeo = new THREE.BoxGeometry(1.6, 1.2, 0.15);
  for (const c of centers) {
    // Central plaza block (0,0) stays open — fountain instead.
    if (c.x === 20 && c.z === 20) continue;
    if (c.x === -20 && c.z === 20) continue; // keep plaza approach open
    const count = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const w = 10 + rng() * 10;
      const d = 10 + rng() * 10;
      const h = 6 + rng() * 22;
      const ox = (rng() - 0.5) * (30 - w);
      const oz = (rng() - 0.5) * (30 - d);
      const bx = c.x + ox, bz = c.z + oz;
      // Keep buildings off the plaza block edges.
      if (Math.abs(bx) < 14 && Math.abs(bz) < 14) continue;
      const color = pick(BUILDING_COLORS);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      b.position.set(bx, h / 2, bz);
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), new THREE.MeshLambertMaterial({ color: pick(ROOF_COLORS) }));
      roof.position.set(bx, h + 0.25, bz);
      group.add(roof);
      // Lit windows on two faces.
      const floors = Math.max(1, Math.floor(h / 4));
      for (let f = 0; f < floors; f++) {
        for (let k = -1; k <= 1; k++) {
          const win = new THREE.Mesh(winGeo, windowMat);
          win.position.set(bx + k * (w / 3.2), 2.5 + f * 4, bz + d / 2 + 0.08);
          group.add(win);
        }
      }
      colliders.push({ minX: bx - w / 2 - 0.3, maxX: bx + w / 2 + 0.3, minZ: bz - d / 2 - 0.3, maxZ: bz + d / 2 + 0.3 });
    }
  }

  // --- Central plaza: circular paving + fountain at (0,0).
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17, 0.3, 32),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a0 })
  );
  plaza.position.set(0, 0.05, 0);
  plaza.receiveShadow = true;
  group.add(plaza);
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.6, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0x7a8894 })
  );
  fountainBase.position.set(0, 0.55, 0);
  fountainBase.castShadow = true;
  group.add(fountainBase);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.4, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: 0x35a0d8 })
  );
  fountainWater.position.set(0, 1.05, 0);
  group.add(fountainWater);
  const fountainJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 2.6, 12),
    new THREE.MeshLambertMaterial({ color: 0x9ad8f0 })
  );
  fountainJet.position.set(0, 2.2, 0);
  group.add(fountainJet);

  // --- Marina pier + yacht on the east edge (x ~ 112, z = -40).
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
  );
  pier.position.set(118, 0.1, -40);
  pier.castShadow = true;
  group.add(pier);
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0x6b543a }));
    post.position.set(108 + i * 7, 0.6, -36.5);
    group.add(post);
  }
  // Yacht: white hull + cabin + mast.
  const yacht = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 3.4), new THREE.MeshLambertMaterial({ color: 0xf2f2ee }));
  hull.position.y = 0.6; yacht.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 1.8, 2.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e0 }));
  cabin.position.set(-0.5, 2.4, 0); yacht.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  mast.position.set(1, 5, 0); yacht.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.4), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  sail.position.set(2.6, 4.6, 0); yacht.add(sail);
  yacht.position.set(128, -0.2, -48);
  yacht.rotation.y = 0.4;
  group.add(yacht);

  // --- Palms along the beach and plaza.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a });
  function palm(x, z, h = 5) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, h, 7), trunkMat);
    trunk.position.y = h / 2; trunk.castShadow = true; p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, h + 0.2, Math.sin(a) * 1.1);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.35;
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (let z = -100; z <= 100; z += 20) { palm(98, z, 4.5 + rng() * 2); palm(93, z + 10, 4 + rng() * 2); }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    palm(Math.cos(a) * 20, Math.sin(a) * 20, 4.5);
  }

  // --- Streetlights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3f });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
  for (const cx of ROAD_COORDS) {
    for (const cz of ROAD_COORDS) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(cx + 6.5, 3, cz + 6.5);
      group.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(cx + 6.5, 6.1, cz + 6.5);
      group.add(lamp);
    }
  }

  // --- Docks sign / flavour: crates near the west docks.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8763e });
  for (let i = 0; i < 10; i++) {
    const s = 1.6 + rng() * 1.2;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(-96 + rng() * 8, s / 2, -60 + i * 12 + rng() * 3);
    crate.rotation.y = rng() * 1.2;
    crate.castShadow = true;
    group.add(crate);
    colliders.push({ minX: crate.position.x - s / 2, maxX: crate.position.x + s / 2, minZ: crate.position.z - s / 2, maxZ: crate.position.z + s / 2 });
  }

  return {
    group,
    colliders,
    landmarks: {
      plaza: { x: 0, z: 0 },
      beach: { x: 100, z: 40 },
      marina: { x: 118, z: -40 },
      docks: { x: -95, z: 0 },
      garage: { x: -80, z: 0 },
      bank: { x: -20, z: -60 },
    },
  };
}

// Point-in-collider test used by cars, player and AI.
export function collidesWithBuildings(colliders, x, z, r = 1) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
  }
  return false;
}
// Push a circle out of building AABBs (simple slide).
export function resolveBuildingCollision(colliders, pos, r = 1) {
  for (const c of colliders) {
    if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
      const dxl = pos.x + r - c.minX, dxr = c.maxX - (pos.x - r);
      const dzl = pos.z + r - c.minZ, dzr = c.maxZ - (pos.z - r);
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - r;
      else if (m === dxr) pos.x = c.maxX + r;
      else if (m === dzl) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
    }
  }
  return pos;
}
