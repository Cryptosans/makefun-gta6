// Solara Bay — keyboard + mouse input, with drag-orbit camera control.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.canvas = canvas;
    this.onKey = null; // (code, down) => void — game hooks single presses here
    this.onMouseDown = null;
    this._down = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._up = (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false);
    };
    this._blur = () => { this.keys.clear(); this.mouseDown = false; };
    this._md = (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.onMouseDown) this.onMouseDown();
      }
    };
    this._mu = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._mm = (e) => {
      if (this.mouseDown) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    };
    this._ctx = (e) => e.preventDefault();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    canvas.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('mousemove', this._mm);
    canvas.addEventListener('contextmenu', this._ctx);
  }

  get forward() {
    const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    return f;
  }
  get strafe() {
    return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
  }
  // For driving: A/D steer (left positive = left turn).
  get steer() { return -this.strafe; }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get handbrake() { return this.keys.has('Space'); }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
    this.canvas.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('mousemove', this._mm);
    this.canvas.removeEventListener('contextmenu', this._ctx);
  }
}
