// save.js — localStorage persistence for Solara Bay.
// Only progress that survives a reload is stored: cash, health, the
// mission index and the player's position. Everything else (traffic,
// pedestrians, police) is rebuilt fresh on load.

const SAVE_KEY = 'solara-bay-save-v1';

export function saveGame(state, playerPos) {
  try {
    const data = {
      cash: Math.round(state.cash),
      health: Math.round(state.health),
      missionIndex: state.missionIndex,
      playerX: playerPos.x,
      playerZ: playerPos.z,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Storage unavailable; nothing to clear.
  }
}
