// Solara Bay — keyboard + mouse input. Tracks held keys, edge-triggered
// presses (consumed once), and drag-to-orbit camera angles. No game logic.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.dragging = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.wheelDelta = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.onFirstGesture = null;
    this._gestured = false;
    this._canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._gesture();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.yawDelta += e.clientX - this.lastX;
      this.pitchDelta += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheelDelta += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _gesture() {
    if (this._gestured) return;
    this._gestured = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  down(code) { return this.keys.has(code); }
  /** True once, the frame the key went down. Call every frame to consume. */
  wasPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  /** WASD / arrows as a -1..1 axis pair. */
  moveAxis() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }
  /** Consume per-frame camera deltas (pixels dragged, wheel ticks). */
  consumeCamera() {
    const out = { yaw: this.yawDelta, pitch: this.pitchDelta, wheel: this.wheelDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.wheelDelta = 0;
    return out;
  }
  endFrame() { this.pressed.clear(); }
}
