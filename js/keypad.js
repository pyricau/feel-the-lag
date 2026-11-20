import { engine } from './engine.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

/**
 * A keypad whose visual response (key highlight and the digit appearing) is
 * held back by a whole number of frames. Input handling itself is never
 * delayed or blocked: only what you see is late.
 */
export class Keypad {
  constructor(root, { onInteract } = {}) {
    this.delayFrames = 0;
    this.queue = [];
    this.value = '';
    this.onInteract = onInteract;

    root.innerHTML = `
      <div class="keypad">
        <div class="kp-display"><span class="kp-value"></span></div>
        <div class="kp-grid">
          ${KEYS.map((k) => `<div class="key" data-key="${k}">${k}</div>`).join('')}
        </div>
      </div>`;
    this.display = root.querySelector('.kp-value');
    this.renderValue();

    // iOS Safari still zooms on a double tap (a slow one, especially) despite
    // touch-action: none and preventDefault() on pointerdown. Cancelling the
    // touch itself is what stops it. Keys only listen to pointer events, so
    // nothing here needs the click this suppresses.
    root
      .querySelector('.keypad')
      .addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    const grid = root.querySelector('.kp-grid');
    this.pressed = new Map(); // pointerId -> key element

    grid.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('.key');
      if (!key) return;
      e.preventDefault();
      engine.noteInput(e);
      this.pressed.set(e.pointerId, { key, at: engine.tick + 1 + this.delayFrames });
      this.schedule(() => {
        key.classList.add('down');
        this.press(key.dataset.key);
      });
      this.onInteract?.();
    });
    const release = (e) => {
      const press = this.pressed.get(e.pointerId);
      if (!press) return;
      this.pressed.delete(e.pointerId);
      // Keep the highlight up for at least 3 frames so a quick tap is still visible.
      this.schedule(() => press.key.classList.remove('down'), press.at + 3);
    };
    grid.addEventListener('pointerup', release);
    grid.addEventListener('pointercancel', release);
    grid.addEventListener('pointerleave', release);

    this.stop = engine.onFrame((_, tick) => {
      while (this.queue.length && this.queue[0].at <= tick) this.queue.shift().fn();
    });
  }

  schedule(fn, notBefore = 0) {
    // With 0 frames of delay this lands in the very next frame, exactly like
    // updating the DOM directly in the event handler would.
    const at = Math.max(engine.tick + 1 + this.delayFrames, notBefore);
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].at > at) i--;
    this.queue.splice(i, 0, { at, fn });
  }

  press(k) {
    if (k === 'C') this.value = '';
    else if (k === '⌫') this.value = this.value.slice(0, -1);
    else this.value = (this.value + k).slice(-9);
    this.renderValue();
  }

  renderValue() {
    const cents = this.value.padStart(3, '0');
    const amount = `${Number(cents.slice(0, -2)).toLocaleString('en-US')}.${cents.slice(-2)}`;
    this.display.textContent = `$${amount}`;
  }

  setDelayFrames(frames) {
    this.delayFrames = frames;
  }

  reset() {
    this.queue.forEach((q) => q.fn());
    this.queue = [];
    this.value = '';
    this.renderValue();
  }

  destroy() {
    this.stop();
  }
}
