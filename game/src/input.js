// input.js — keyboard + mouse state, pointer lock, edge-triggered keys.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {}; // edge-triggered, consumed each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // edge-triggered
    this.locked = false;
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      if (!this.locked) {
        try { canvas.requestPointerLock(); } catch (err) { /* headless may refuse */ }
      }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  isDown(...names) { return names.some((n) => !!this.keys[n]); }
  // True once on the frame the key went down.
  wasPressed(...names) { return names.some((n) => !!this.pressed[n]); }
  consumeMouseClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
  endFrame() { this.pressed = {}; }
  // Synthetic helpers used by automated verification drivers.
  injectKey(code, down) { this.keys[code] = down; if (down) this.pressed[code] = true; }
}
