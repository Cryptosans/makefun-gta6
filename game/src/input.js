// input.js — keyboard and mouse state for Solara Bay.
// One shared object is polled by the player, combat and camera code each
// frame. Mouse-look accumulates movement deltas while pointer lock is
// held; clicking the canvas requests the lock.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.pointerLocked = false;
    this._pressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
        if (!this.pointerLocked) {
          try {
            const result = canvas.requestPointerLock();
            if (result && result.catch) result.catch(() => {});
          } catch (err) {
            // Pointer lock unavailable (e.g. headless); mouse look is optional.
          }
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down; consumed by endFrame().
  pressed(code) {
    return this._pressed.has(code);
  }

  // Mouse deltas accumulated since the last frame, then zeroed.
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  endFrame() {
    this._pressed.clear();
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
