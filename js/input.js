// Keyboard + mouse (pointer lock) + touch input, normalised into one state object.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };      // -1..1, y = forward
    this.look = { dx: 0, dy: 0 };    // consumed each frame
    this.sprint = false;
    this.jump = false;               // edge-triggered, cleared by consumer
    this.bite = false;
    this.tail = false;
    this.fire = false;               // held
    this.pointerLocked = false;
    this.hasTouch = !!(navigator.maxTouchPoints > 0) || 'ontouchstart' in window;
    this.touchActive = false;      // true once the player actually uses touch
    this.onModeChange = null;      // host swaps the on-screen controls
    this._stick = null;
    this._touchFire = false;
    this._touchSprint = false;

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this._setMode(false);
      if (k === 'Space') { this.jump = true; e.preventDefault(); }
      if (k === 'KeyJ') this.bite = true;
      if (k === 'KeyK') this.tail = true;
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; });
  }

  _bindMouse() {
    this._mouseFire = false;
    this._drag = null;
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) {
        // works even if the browser refuses pointer lock: drag to orbit
        this._drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
        this.requestLock();
        return;
      }
      if (e.button === 0) this.bite = true;            // left  — bite
      if (e.button === 2) this._mouseFire = true;      // right — fire breath (hold)
      if (e.button === 1) this.tail = true;            // middle — tail whip
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this._mouseFire = false;
      if (this._drag && e.button === this._drag.button) {
        // a click that did not turn into a drag still counts as an attack
        if (this._drag.moved < 7 && e.button === 0 && !this.pointerLocked) this.bite = true;
        this._drag = null;
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.look.dx += dx * 1.5;
      this.look.dy += dy * 1.5;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) this.onLock?.();
      else this.onUnlock?.();
    });
  }

  _setMode(touch) {
    if (this.touchActive === touch) return;
    this.touchActive = touch;
    this.onModeChange?.(touch);
  }

  requestLock() {
    if (this.touchActive) return;
    this.canvas.requestPointerLock?.();
  }

  _bindTouch() {
    const pad = document.getElementById('touch');
    if (!pad) return;
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const active = new Map();

    const stickRect = () => stick.getBoundingClientRect();

    const setStick = (t) => {
      const r = stickRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (t.clientX - cx) / (r.width / 2);
      let dy = (t.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.move.x = dx; this.move.y = -dy;
      knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    };

    pad.addEventListener('touchstart', (e) => {
      this._setMode(true);
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const btn = el?.closest?.('[data-act]');
        if (btn) {
          const act = btn.dataset.act;
          active.set(t.identifier, act);
          btn.classList.add('down');
          if (act === 'bite') this.bite = true;
          if (act === 'tail') this.tail = true;
          if (act === 'fire') this._touchFire = true;
          if (act === 'jump') this.jump = true;
          if (act === 'sprint') this._touchSprint = !this._touchSprint;
        } else if (t.clientX < innerWidth * 0.45 && t.clientY > innerHeight * 0.42 && this._stick === null) {
          this._stick = t.identifier;
          active.set(t.identifier, 'stick');
          setStick(t);
        } else {
          active.set(t.identifier, 'look');
          this._lookLast = { x: t.clientX, y: t.clientY, id: t.identifier };
        }
      }
      e.preventDefault();
    }, { passive: false });

    pad.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const kind = active.get(t.identifier);
        if (kind === 'stick') setStick(t);
        else if (kind === 'look' && this._lookLast?.id === t.identifier) {
          this.look.dx += (t.clientX - this._lookLast.x) * 1.8;
          this.look.dy += (t.clientY - this._lookLast.y) * 1.8;
          this._lookLast.x = t.clientX; this._lookLast.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        const kind = active.get(t.identifier);
        active.delete(t.identifier);
        if (kind === 'stick') {
          this._stick = null; this.move.x = 0; this.move.y = 0;
          knob.style.transform = 'translate(0,0)';
        } else if (kind === 'fire') this._touchFire = false;
        if (kind && kind !== 'stick' && kind !== 'look') {
          document.querySelectorAll(`[data-act="${kind}"]`).forEach((b) => b.classList.remove('down'));
        }
      }
    };
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);
  }

  // Called once per frame by the game before reading state.
  sample() {
    if (this.scripted) return;      // automated tests drive the fields directly
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }

    // the joystick wins while a finger is on it, otherwise the keyboard does
    if (this._stick === null) { this.move.x = x; this.move.y = y; }

    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this._touchSprint;
    this.fire = k.has('KeyF') || k.has('KeyL') || this._mouseFire === true || this._touchFire;
  }

  consumeLook() {
    const dx = this.look.dx, dy = this.look.dy;
    this.look.dx = 0; this.look.dy = 0;
    return { dx, dy };
  }

  consume(name) {
    if (this[name]) { this[name] = false; return true; }
    return false;
  }
}
