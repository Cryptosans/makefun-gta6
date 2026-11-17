// Solara Bay — small math and collision helpers shared by every system.
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function rand(a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function choiceWeighted(pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let r = Math.random() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
// Shortest signed angle difference, radians.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }
export function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); }
// Format cash like $12,500
export function fmtCash(n) { return Math.floor(n).toLocaleString('en-US'); }
// Format a seconds countdown like 1:23
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Push a circle (x,z,r) out of every AABB collider it overlaps.
 * colliders: [{minX,maxX,minZ,maxZ}]. Mutates `p` ({x,z}) in place.
 * Returns true when a push happened.
 */
export function collideCircle(p, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(p.x, c.minX, c.maxX);
    const cz = clamp(p.z, c.minZ, c.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        p.x += dx * push;
        p.z += dz * push;
      } else {
        // Centre inside the box: shove out along the smallest penetration axis.
        const pl = p.x - c.minX, pr = c.maxX - p.x;
        const pt = p.z - c.minZ, pb = c.maxZ - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = c.minX - r;
        else if (m === pr) p.x = c.maxX + r;
        else if (m === pt) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      }
    }
  }
  return hit;
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Canvas texture helpers — all art is generated, nothing is fetched.
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
