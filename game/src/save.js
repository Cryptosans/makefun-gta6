// Solara Bay — save / continue via localStorage. Stores cash, story
// progress, the player's spot and health, and the current weapon. Wanted
// is never saved: a fresh session starts clean, like a new day in the bay.
import { CONFIG } from './config.js';

export const SaveSys = {
  hasSave() {
    try {
      return localStorage.getItem(CONFIG.saveKey) !== null;
    } catch {
      return false;
    }
  },

  save(data) {
    try {
      const payload = {
        version: 1,
        savedAt: Date.now(),
        cash: data.cash,
        completed: [...data.completed],
        player: { x: data.playerX, z: data.playerZ, heading: data.heading, health: data.health },
        weapon: data.weapon,
        ammo: data.ammo,
        reserve: data.reserve,
      };
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.completed)) return null;
      return data;
    } catch {
      return null;
    }
  },

  clear() {
    try { localStorage.removeItem(CONFIG.saveKey); } catch { /* private mode */ }
  },
};
