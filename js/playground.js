import { engine, msLabel, fpsLabel } from './engine.js';
import { Keypad } from './keypad.js';
import { Scroller, JANK_RATE } from './scroller.js';
import { deviceBar } from './device.js';

const framesFor = (ms) => Math.max(1, Math.round(ms / engine.frameMs));
const uniq = (list) => [...new Set(list)];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : word.endsWith('sh') ? 'es' : 's'}`;

/** Refreshes one frame occupies when it needs `ms` of extra work (assuming the rest of the frame is free). */
export const refreshesForWork = (ms) => (ms <= 0 ? 1 : Math.ceil(ms / engine.frameMs - 1e-6));

const SCROLL_CONTROLS = [
  {
    name: 'latency',
    tab: 'Latency',
    max: () => Math.round(250 / engine.frameMs),
    presets: () => [0, ...uniq([8, 17, 33, 67, 100].map(framesFor))],
    label: (f) => `+${msLabel(f)}`,
    explain: (f) =>
      f === 0
        ? 'Every frame shows where your finger is right now. Each tab slows scrolling down in a different way: try them all and see which feels worst.'
        : `Still ${fpsLabel(1)}: every frame is on time, but shows where your finger was ${plural(f, 'frame')} (${msLabel(
            f
          )}) ago, so the list trails it smoothly. In code: nothing is slow, but the touch waits a frame or more before it's used (posted callbacks, async hops, queued frames).`,
    apply: (s, f) => s.setLatencyFrames(f),
  },
  {
    name: 'fps',
    tab: 'Frame rate',
    min: 1,
    max: () => 8,
    presets: () => [1, 2, 3, 4, 6],
    label: (h) => fpsLabel(h),
    explain: (h) =>
      h === 1
        ? `A new frame on every refresh (every ${msLabel(1)}).`
        : `Each frame stays on screen for ${plural(h, 'refresh')} (${msLabel(
            h
          )}), so motion moves in steps. In code: animating on a timer instead of the display's frame callback, or a capped refresh rate (battery saver).`,
    apply: (s, h) => s.setHold(h),
  },
  {
    name: 'work',
    tab: 'Slow frames',
    max: () => 60,
    presets: () => [0, 10, 16, 18, 34],
    label: (ms) => (ms ? `+${ms} ms work` : 'none'),
    chip: (ms) => `${ms} ms`,
    explain: (ms) => {
      const k = refreshesForWork(ms);
      const budget = engine.frameMs.toFixed(1);
      if (ms === 0) return `Each frame has ${budget} ms to be ready before the next refresh.`;
      if (k === 1) return `Still fits in the ${budget} ms frame budget: no visible change. (This assumes the rest of the frame costs nothing.)`;
      return `Misses the ${budget} ms deadline, so every frame takes ${plural(k, 'refresh')}: ${fpsLabel(k)} instead of ${fpsLabel(
        1
      )}, and what you see is ${msLabel(k - 1)} older. In code: too much main-thread work per frame (new list rows, layout, image decoding, disk reads).`;
    },
    apply: (s, ms) => s.setOverrun(refreshesForWork(ms)),
  },
  {
    name: 'jank',
    tab: 'Jank',
    max: () => 12,
    presets: () => [0, 1, 2, 4, 8],
    label: (f) => (f ? `${plural(f, 'frame')} frozen` : 'none'),
    chip: (f) => (f ? `${f}` : 'none'),
    explain: (f) =>
      f === 0
        ? 'No frozen frames.'
        : `${JANK_RATE * 100}% of frames, at random, freeze the screen for ${plural(f, 'frame')} (${msLabel(
            f
          )}), then the list jumps to where it should be. In code: an occasional slow frame (a garbage collection pause, one expensive list item, a lock).`,
    apply: (s, f) => s.setFreezeFrames(f),
  },
];

const TAP_CONTROLS = [
  {
    name: 'delay',
    tab: 'Tap delay',
    max: () => Math.round(500 / engine.frameMs),
    presets: () => [0, ...uniq([33, 67, 100, 200, 300].map(framesFor))],
    label: (f) => `+${msLabel(f)}`,
    explain: (f) =>
      f === 0
        ? 'The key lights up on the very next frame after your finger lands.'
        : `The key lights up and the digit appears ${plural(f, 'frame')} (${msLabel(f)}) after your finger lands. Your tap itself is registered immediately; only what you see is late.`,
    apply: (k, f) => k.setDelayFrames(f),
  },
];

export function renderPlayground(app, domainKey) {
  const isTap = domainKey === 'tap';
  const controls = isTap ? TAP_CONTROLS : SCROLL_CONTROLS;
  app.innerHTML = `
    <div class="run">
      <div class="run-top">
        <a class="back" href="#/">‹</a>
        <div class="run-title">Playground · ${isTap ? 'Tap response' : 'Scroll'}</div>
      </div>
      <div class="stage"></div>
      <div class="controls">
        ${controls.length > 1 ? `<div class="tabs">${controls.map((c) => `<button data-tab="${c.name}">${c.tab}</button>`).join('')}</div>` : ''}
        ${controls
          .map(
            (c) => `
          <div class="control" data-control="${c.name}">
            <div class="control-head"><span>${c.tab}</span><output></output></div>
            <input type="range" min="${c.min ?? 0}" max="${c.max()}" value="${c.min ?? 0}" step="1">
            <div class="chips">${c
              .presets()
              .map((v) => `<button class="chip" data-value="${v}">${(c.chip ?? c.label)(v)}</button>`)
              .join('')}</div>
            <div class="explain"></div>
          </div>`
          )
          .join('')}
        <div class="device-slot"></div>
      </div>
    </div>`;

  const stage = app.querySelector('.stage');
  const stopDevice = deviceBar(app.querySelector('.device-slot'));
  const experience = isTap ? new Keypad(stage) : new Scroller(stage);

  // Only the visible tab's setting is applied, so each effect is felt on its
  // own. The others keep their slider value for when you come back.
  let activeTab = controls[0].name;
  const values = Object.fromEntries(controls.map((c) => [c.name, c.min ?? 0]));
  const applyActive = () => {
    for (const c of controls) c.apply(experience, c.name === activeTab ? values[c.name] : c.min ?? 0);
  };

  for (const c of controls) {
    const wrap = app.querySelector(`[data-control="${c.name}"]`);
    const input = wrap.querySelector('input');
    const set = (v) => {
      v = Number(v);
      values[c.name] = v;
      input.value = v;
      wrap.querySelector('output').textContent = c.label(v);
      wrap.querySelector('.explain').textContent = c.explain(v);
      wrap.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('active', Number(chip.dataset.value) === v));
      applyActive();
    };
    input.addEventListener('input', () => set(input.value));
    wrap.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => set(chip.dataset.value)));
    set(input.value);
  }

  const showTab = (name) => {
    activeTab = name;
    app.querySelectorAll('[data-control]').forEach((w) => w.classList.toggle('hidden', w.dataset.control !== name));
    app.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    applyActive();
  };
  app.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab(activeTab);

  return () => {
    stopDevice();
    experience.destroy();
  };
}
