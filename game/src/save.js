// save.js — localStorage persistence for New Game / Continue.
const KEY = 'solara-bay-save-v1';

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
}
export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      missionIndex: state.missionIndex,
      health: state.health,
      playerPos: state.playerPos,
      playerHeading: state.playerHeading,
      clockMinutes: state.clockMinutes,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch (e) { return null; }
}
export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
export function saveMeta() {
  const s = loadSave();
  if (!s) return null;
  return {
    cash: s.cash,
    missionIndex: s.missionIndex,
    savedAt: s.savedAt,
  };
}
