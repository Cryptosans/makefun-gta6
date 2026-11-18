// utils.js — small shared math and random helpers for Solara Bay.
// Every other module imports from here so the same conventions (angles in
// radians, positions as plain {x, z} pairs on the ground plane) hold
// everywhere. Nothing here touches the DOM or the renderer.

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

// Move `from` toward `to` by at most `maxStep` radians, taking the short way.
export function angleLerp(from, to, maxStep) {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export function rand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Heading (radians) that points from (ax, az) toward (bx, bz), using the
// same convention as the vehicles: forward = (sin(h), cos(h)).
export function headingTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

// Format an integer amount of dollars with a thousands separator.
export function money(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

// Format in-game minutes since midnight as a 24h clock string.
export function clockString(minutes) {
  const total = Math.floor(minutes) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// A tiny deterministic hash of a string, used to vary building colours
// without storing extra state.
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
