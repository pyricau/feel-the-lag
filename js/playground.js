import { engine, msLabel, fpsLabel } from './engine.js';
import { Keypad } from './keypad.js';
import { Scroller } from './scroller.js';
import { deviceBar } from './device.js';

function chips(values, label) {
  return values.map((v) => `<button class="chip" data-value="${v}">${label(v)}</button>`).join('');
}

function bindSlider(root, name, { max, label, chipLabel = label, onChange, presets }) {
  const wrap = root.querySelector(`[data-control="${name}"]`);
  const input = wrap.querySelector('input');
  const out = wrap.querySelector('output');
  input.max = max;
  const set = (v) => {
    input.value = v;
    out.textContent = label(Number(v));
    wrap.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.value) === Number(v)));
    onChange(Number(v));
  };
  input.addEventListener('input', () => set(input.value));
  if (presets) {
    wrap.querySelector('.chips').innerHTML = chips(presets, chipLabel);
    wrap.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => set(c.dataset.value)));
  }
  set(input.value);
}

const control = (name, title) => `
  <div class="control" data-control="${name}">
    <div class="control-head"><span>${title}</span><output></output></div>
    <input type="range" min="0" value="0" step="1">
    <div class="chips"></div>
  </div>`;

const framesFor = (ms) => Math.max(1, Math.round(ms / engine.frameMs));
const uniq = (list) => [...new Set(list)];

export function renderPlayground(app, domainKey) {
  const isTap = domainKey === 'tap';
  app.innerHTML = `
    <div class="run">
      <div class="run-top">
        <a class="back" href="#/">‹</a>
        <div class="run-title">Playground · ${isTap ? 'Tap response' : 'Scroll'}</div>
      </div>
      <div class="stage"></div>
      <div class="controls">
        ${isTap ? control('delay', 'Added tap delay') : control('latency', 'Added latency') + control('fps', 'Frame rate') + control('jank', 'Dropped frames')}
        <div class="device-slot"></div>
      </div>
    </div>`;

  const stage = app.querySelector('.stage');
  const controls = app.querySelector('.controls');
  const stopDevice = deviceBar(app.querySelector('.device-slot'));
  let experience;

  if (isTap) {
    experience = new Keypad(stage);
    bindSlider(controls, 'delay', {
      max: Math.round(500 / engine.frameMs),
      label: (f) => `+${msLabel(f)}`,
      presets: [0, ...uniq([33, 67, 100, 200, 300].map(framesFor))],
      onChange: (f) => experience.setDelayFrames(f),
    });
  } else {
    experience = new Scroller(stage);
    bindSlider(controls, 'latency', {
      max: Math.round(250 / engine.frameMs),
      label: (f) => `+${msLabel(f)}`,
      presets: [0, ...uniq([8, 17, 33, 67, 100].map(framesFor))],
      onChange: (f) => experience.setLatencyFrames(f),
    });
    // The slider picks how many refreshes each frame is held for: 1 = every frame.
    const fpsWrap = controls.querySelector('[data-control="fps"] input');
    fpsWrap.min = 1;
    fpsWrap.value = 1;
    bindSlider(controls, 'fps', {
      max: 8,
      label: (h) => fpsLabel(h),
      presets: [1, 2, 3, 4, 6],
      onChange: (h) => experience.setHold(h),
    });
    bindSlider(controls, 'jank', {
      max: 30,
      label: (p) => (p ? `${p}% of frames` : 'none'),
      chipLabel: (p) => (p ? `${p}%` : 'none'),
      presets: [0, 2, 5, 10, 20],
      onChange: (p) => experience.setJank(p / 100),
    });
  }

  return () => {
    stopDevice();
    experience.destroy();
  };
}
