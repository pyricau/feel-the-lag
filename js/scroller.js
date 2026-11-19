import { engine } from './engine.js';

// iOS UIScrollView "normal" deceleration: velocity is multiplied by 0.998 every ms.
const DECELERATION = 0.998;
// Critically damped spring that pulls an overscrolled list back to its edge.
const SPRING_OMEGA = 0.016; // rad/ms
const RUBBER = 0.55; // iOS rubber-band constant
const MAX_VELOCITY = 8; // px/ms
const VELOCITY_WINDOW = 100; // ms of samples used to compute the release velocity
export const JANK_RATE = 0.2; // share of frames that start a freeze

const NAMES = [
  'Flat white', 'Croissant', 'Oat latte', 'Pain au chocolat', 'Espresso', 'Cold brew',
  'Matcha', 'Brioche', 'Cortado', 'Chai', 'Macchiato', 'Cinnamon roll', 'Americano',
  'Kouign-amann', 'Mocha', 'Scone', 'Cappuccino', 'Madeleine', 'Hot chocolate', 'Bagel',
];

function rowsHtml(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    if (i % 12 === 0) html += `<div class="sec">Section ${i / 12 + 1}</div>`;
    const name = NAMES[i % NAMES.length];
    const hue = (i * 47) % 360;
    const price = (3 + ((i * 37) % 70) / 10).toFixed(2);
    html += `
      <div class="row">
        <div class="avatar" style="background:hsl(${hue} 55% 45%)">${name[0]}</div>
        <div class="row-text"><div class="row-title">${name}</div><div class="row-sub">Order #${1000 + i} · ${
      (i % 9) + 1
    } min ago</div></div>
        <div class="row-price">$${price}</div>
      </div>`;
  }
  return html;
}

/**
 * A custom touch scroller, because native scrolling can't be delayed or
 * throttled from JavaScript. It simulates the "true" scroll position every
 * frame, keeps a history of it, and displays:
 *  - the position from N frames ago (added latency), and/or
 *  - a new position only every H frames (reduced frame rate), and/or
 *  - both at once, when each frame takes K refreshes of work (overrun), and/or
 *  - freezes of F frames that start on a random 20% of frames (jank).
 * With everything at its default it renders the current position every frame.
 */
export class Scroller {
  constructor(root, { onInteract } = {}) {
    this.onInteract = onInteract;
    this.latencyFrames = 0;
    this.hold = 1;
    this.overrun = 1;
    this.freezeFrames = 0;

    root.innerHTML = `<div class="scroller"><div class="scroll-content">${rowsHtml(150)}</div></div>`;
    this.viewport = root.querySelector('.scroller');
    this.content = root.querySelector('.scroll-content');

    this.resetState();

    this.viewport.addEventListener('pointerdown', (e) => this.down(e));
    this.viewport.addEventListener('pointermove', (e) => this.move(e));
    this.viewport.addEventListener('pointerup', (e) => this.up(e));
    this.viewport.addEventListener('pointercancel', (e) => this.up(e));
    // iOS Safari: stop the page itself from rubber-banding behind us.
    this.viewport.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    this.stop = engine.onFrame((t, tick) => this.frame(t, tick));
  }

  resetState() {
    this.pos = 0;
    this.velocity = 0; // px/ms, positive = content moving up (scrolling down)
    this.pointerId = null;
    this.samples = [];
    this.history = [];
    this.lastTime = null;
    this.stall = 0;
    this.physicsDebt = 0;
    this.shown = null;
    this.render(0);
  }

  get maxScroll() {
    return Math.max(0, this.content.offsetHeight - this.viewport.clientHeight);
  }

  get height() {
    return this.viewport.clientHeight || 600;
  }

  rubber(d) {
    const h = this.height;
    return (1 - 1 / ((d * RUBBER) / h + 1)) * h;
  }

  unrubber(r) {
    const h = this.height;
    return (h / RUBBER) * (1 / (1 - Math.min(r, h * 0.99) / h) - 1);
  }

  /** Inverse of the rubber band, so grabbing an overscrolled list doesn't jump. */
  rawFromPos(pos) {
    const max = this.maxScroll;
    if (pos < 0) return -this.unrubber(-pos);
    if (pos > max) return max + this.unrubber(pos - max);
    return pos;
  }

  posFromRaw(raw) {
    const max = this.maxScroll;
    if (raw < 0) return -this.rubber(-raw);
    if (raw > max) return max + this.rubber(raw - max);
    return raw;
  }

  down(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    engine.noteInput(e);
    this.viewport.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.velocity = 0;
    this.startY = e.clientY;
    this.lastY = e.clientY;
    this.startRaw = this.rawFromPos(this.pos);
    this.samples = [{ t: e.timeStamp, y: e.clientY }];
    this.onInteract?.();
  }

  move(e) {
    if (e.pointerId !== this.pointerId) return;
    engine.noteInput(e);
    this.lastY = e.clientY;
    this.samples.push({ t: e.timeStamp, y: e.clientY });
    const cutoff = e.timeStamp - 2 * VELOCITY_WINDOW;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.samples.push({ t: e.timeStamp, y: e.clientY });
    const last = this.samples[this.samples.length - 1];
    const first = this.samples.find((s) => s.t >= last.t - VELOCITY_WINDOW) ?? last;
    const dt = last.t - first.t;
    const v = dt > 0 ? -(last.y - first.y) / dt : 0;
    this.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
  }

  step(dtMs) {
    const max = this.maxScroll;
    for (let i = 0; i < dtMs; i++) {
      const edge = this.pos < 0 ? 0 : this.pos > max ? max : null;
      if (edge !== null) {
        const w = SPRING_OMEGA;
        this.velocity += -w * w * (this.pos - edge) - 2 * w * this.velocity;
        this.pos += this.velocity;
        if (Math.abs(this.pos - edge) < 0.3 && Math.abs(this.velocity) < 0.02) {
          this.pos = edge;
          this.velocity = 0;
        }
      } else {
        this.velocity *= DECELERATION;
        this.pos += this.velocity;
        if (Math.abs(this.velocity) < 0.003) this.velocity = 0;
      }
    }
  }

  frame(t) {
    const dt = this.lastTime === null ? 0 : Math.min(50, t - this.lastTime);
    this.lastTime = t;

    if (this.pointerId !== null) {
      this.pos = this.posFromRaw(this.startRaw + (this.startY - this.lastY));
    } else if (this.velocity !== 0 || this.pos < 0 || this.pos > this.maxScroll) {
      // Integrate in whole 1 ms steps, carrying the remainder (8.33 ms at 120 Hz).
      this.physicsDebt += dt;
      const steps = Math.floor(this.physicsDebt);
      this.physicsDebt -= steps;
      this.step(steps);
    }

    this.history.push(this.pos);
    if (this.history.length > 64) this.history.shift();
    // A frame that needs K refreshes of work samples the input when it starts and
    // reaches the screen K - 1 refreshes later than an on-time frame would, and
    // the next frame can only start then: lower frame rate *and* added latency.
    const lag = this.latencyFrames + this.overrun - 1;
    const delayed = this.history[Math.max(0, this.history.length - 1 - lag)];

    this.frameCount = (this.frameCount ?? 0) + 1;
    if (this.frameCount % Math.max(this.hold, this.overrun) !== 0) return;
    if (this.stall > 0) {
      this.stall--;
      return;
    }
    if (this.freezeFrames > 0 && Math.random() < JANK_RATE) {
      this.stall = this.freezeFrames - 1; // this frame plus the rest of the freeze
      return;
    }
    this.render(delayed);
  }

  render(pos) {
    if (pos === this.shown) return;
    this.shown = pos;
    this.content.style.transform = `translate3d(0, ${-pos}px, 0)`;
  }

  setLatencyFrames(frames) {
    this.latencyFrames = frames;
  }

  setHold(hold) {
    this.hold = hold;
  }

  /** Each frame takes this many refreshes to produce, as if it had too much work to fit in one. */
  setOverrun(refreshes) {
    this.overrun = refreshes;
  }

  /** Each frame has a JANK_RATE chance of freezing the screen for this many frames. */
  setFreezeFrames(frames) {
    this.freezeFrames = frames;
  }

  reset() {
    this.resetState();
  }

  destroy() {
    this.stop();
  }
}
