// Solara Bay — small pure helpers shared by every system. No DOM, no
// three.js here: anything that only needs numbers lives in this file.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest-arc interpolation between two headings (radians). */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Push a circle (x, z, radius) out of an axis-aligned box. Returns true on hit. */
export function pushOutOfBox(pos, radius, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  } else {
    // Centre inside the box: shove out along the shallowest axis.
    const pushes = [
      { d: pos.x - box.minX + radius, x: box.minX - radius, z: pos.z },
      { d: box.maxX - pos.x + radius, x: box.maxX + radius, z: pos.z },
      { d: pos.z - box.minZ + radius, x: pos.x, z: box.minZ - radius },
      { d: box.maxZ - pos.z + radius, x: pos.x, z: box.maxZ + radius },
    ];
    pushes.sort((a, b) => a.d - b.d);
    pos.x = pushes[0].x;
    pos.z = pushes[0].z;
  }
  return true;
}

/** Resolve a circle against every building collider. Returns hit count. */
export function collideBuildings(pos, radius, colliders) {
  let hits = 0;
  for (const box of colliders) {
    if (pos.x < box.minX - radius || pos.x > box.maxX + radius) continue;
    if (pos.z < box.minZ - radius || pos.z > box.maxZ + radius) continue;
    if (pushOutOfBox(pos, radius, box)) hits++;
  }
  return hits;
}

/** Keep a point inside the playable square (water edge blocks the south). */
export function clampToWorld(pos, half) {
  pos.x = clamp(pos.x, -half, half);
  pos.z = clamp(pos.z, -half, half);
}
