// One requestAnimationFrame loop drives everything, so every added delay is a
// whole number of display frames: pixels can only change on a vsync anyway, so
// "+10 ms" on a 60 Hz screen would really be either 0 or 16.7 ms.

const listeners = new Set();
const frameDeltas = [];
const inputDelays = [];
let pendingInputs = [];
let tick = 0;
let lastFrameTime = null;
let frameMs = 1000 / 60;
let resolveReady;
const ready = new Promise((resolve) => (resolveReady = resolve));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function loop(frameTime) {
  tick++;
  if (lastFrameTime !== null) {
    const delta = frameTime - lastFrameTime;
    // Ignore gaps from hidden tabs or long stalls; they aren't the refresh rate.
    if (delta > 2 && delta < 100) {
      frameDeltas.push(delta);
      if (frameDeltas.length > 120) frameDeltas.shift();
    }
  }
  lastFrameTime = frameTime;
  if (frameDeltas.length >= 10 && tick % 10 === 0) {
    frameMs = median(frameDeltas);
    if (frameDeltas.length >= 20) resolveReady();
  }

  // Browser-side input delay: from the event's own timestamp to the frame that
  // consumes it. A lower bound only: the touch sensor, the OS before the
  // browser stamps the event, and the display are all invisible to a page.
  if (pendingInputs.length) {
    const now = performance.now();
    for (const ts of pendingInputs) {
      const d = now - ts;
      if (d >= 0 && d < 250) {
        inputDelays.push(d);
        if (inputDelays.length > 60) inputDelays.shift();
      }
    }
    pendingInputs = [];
  }

  for (const fn of listeners) fn(frameTime, tick);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => {
  lastFrameTime = null;
});

export const engine = {
  /** Resolves once the refresh rate has been measured (about a third of a second). */
  ready,
  /** Number of rAF callbacks so far. A callback added now first runs at tick + 1. */
  get tick() {
    return tick;
  },
  get frameMs() {
    return frameMs;
  },
  get hz() {
    return 1000 / frameMs;
  },
  get inputDelayMs() {
    return inputDelays.length ? median(inputDelays) : null;
  },
  noteInput(event) {
    pendingInputs.push(event.timeStamp);
  },
  onFrame(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function msLabel(frames) {
  return `${Math.round(frames * engine.frameMs)} ms`;
}

export function fpsLabel(hold) {
  return `${Math.round(engine.hz / hold)} fps`;
}
