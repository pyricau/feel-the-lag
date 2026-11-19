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

// Refresh rates displays actually run at. A measured rate within 3% of one of
// these is that rate: the measurement is only off because browsers coarsen
// timestamps (Chrome to 0.1 ms), so a 120 Hz display reports 8.3 and 8.4 ms
// deltas and their median, 8.3 ms, turns 24 frames into "199 ms".
const STANDARD_HZ = [24, 30, 48, 50, 60, 72, 75, 90, 96, 100, 120, 144, 165, 180, 240];

function measureFrameMs(deltas) {
  // Mean of the deltas near the median: the mean undoes the timestamp
  // rounding, and leaving out the outliers drops skipped frames.
  const mid = median(deltas);
  const near = deltas.filter((d) => Math.abs(d - mid) < mid * 0.25);
  const mean = near.reduce((a, b) => a + b, 0) / near.length;
  const hz = 1000 / mean;
  const standard = STANDARD_HZ.find((s) => Math.abs(hz - s) / s < 0.03);
  return standard ? 1000 / standard : mean;
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
    frameMs = measureFrameMs(frameDeltas);
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
