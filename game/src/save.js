// save.js — save and load for Solara Bay, in localStorage: cash, missions,
// collected pickups and the player's last spot. Nothing leaves the browser.
(function () {
  'use strict';

  function saveGame(game) {
    try {
      var data = {
        v: 1,
        cash: game.cash,
        missionsDone: game.missions.index,
        pickupsTaken: game.world.pickups.map(function (p) { return p.taken ? 1 : 0; }),
        health: game.player.health,
        x: game.player.x, z: game.player.z,
        savedAt: Date.now(),
      };
      localStorage.setItem(window.SB.CONFIG.saveKey, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(window.SB.CONFIG.saveKey);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function hasSave() { return loadGame() !== null; }

  window.SB.saveGame = saveGame;
  window.SB.loadGame = loadGame;
  window.SB.hasSave = hasSave;
})();
