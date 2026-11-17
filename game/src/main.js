// Solara Bay — entry point: boot the game once the DOM is ready.
import { Game } from './game.js';

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
try {
  const game = new Game(canvas);
  window.__solaraBay = game;
  loading.classList.add('hidden');
} catch (err) {
  loading.textContent = `Solara Bay could not start: ${err.message}`;
  console.error(err);
}
