import { engine, msLabel, fpsLabel } from './engine.js';
import { Keypad } from './keypad.js';
import { Scroller } from './scroller.js';
import { deviceBar } from './device.js';
import { saveRun, resultsHtml } from './history.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Like the research (Jota et al. 2013, Deber et al. 2015), every trial compares
// a reference against a probe: one side is this phone as-is (+0 ms, full frame
// rate), the other has something added, in random order. The question is
// whether you can tell which one it was; the smallest addition you reliably
// spot is your just-noticeable difference.
export const LAB_DOMAINS = {
  tap: {
    title: 'Tap response',
    blurb: 'Tap the keypad. Either one of A and B shows your taps later, or they are identical.',
    research: 'People notice about 69 ms of added tap latency on a touchscreen (Deber et al., CHI 2015).',
    make: (root, opts) => new Keypad(root, opts),
    apply: (exp, value) => exp.setDelayFrames(value),
    kind: 'delay',
    probesMs: [150, 100, 67, 50, 33, 17],
    better: 'faster',
  },
  scroll: {
    title: 'Scroll latency',
    blurb: 'Drag the list slowly up and down and watch a row under your finger. Either one of A and B follows your finger later, or they are identical.',
    research: 'People notice about 11 ms of added drag latency on a touchscreen (Deber et al., CHI 2015).',
    make: (root, opts) => new Scroller(root, opts),
    apply: (exp, value) => exp.setLatencyFrames(value),
    kind: 'delay',
    probesMs: [100, 67, 50, 33, 17, 8],
    better: 'faster',
  },
  slow: {
    title: 'Scroll slow frames',
    blurb: 'Fling and drag the list. Either one of A and B has too much work per frame, so each frame misses the next refresh, or they are identical.',
    research:
      'Unlike latency, nobody has published a threshold for slow frames while scrolling. Phone users do rate 90 and 120 Hz scrolling smoother than 60 Hz (Li et al., 2025).',
    make: (root, opts) => new Scroller(root, opts),
    apply: (exp, value) => exp.setOverrun(value),
    kind: 'overrun',
    // How long each frame takes. Rounded to whole refreshes; at least 2, since
    // a frame that fits in one refresh is on time.
    frameMs: [67, 50, 33, 25, 17],
    better: 'smoother',
  },
};

function valueLabel(domain, value) {
  if (domain.kind === 'delay') return `+${msLabel(value)}`;
  return value === 1 ? `on time (${fpsLabel(1)})` : `${msLabel(value)} frames (${fpsLabel(value)})`;
}

/** Probe levels from most to least obvious, as whole frames of this display. */
function buildLevels(domain) {
  const seen = new Set();
  const levels = [];
  if (domain.kind === 'overrun') {
    for (const ms of domain.frameMs) {
      const refreshes = Math.round(ms / engine.frameMs);
      if (refreshes < 2 || seen.has(refreshes)) continue;
      seen.add(refreshes);
      levels.push({ key: `o${refreshes}`, label: valueLabel(domain, refreshes), probe: refreshes });
    }
    return levels;
  }
  for (const ms of domain.probesMs) {
    const frames = Math.round(ms / engine.frameMs);
    if (frames < 1 || seen.has(frames)) continue;
    seen.add(frames);
    levels.push({ key: `d${frames}`, label: `+${msLabel(frames)}`, probe: frames });
  }
  return levels;
}

function buildTrials(domain, levels, reps) {
  const reference = domain.kind === 'overrun' ? 1 : 0;
  const order = [];
  levels.forEach((level, index) => {
    // Roughly most obvious first, narrowing, with some mixing.
    for (let r = 0; r < reps; r++) order.push({ level, sortKey: index + Math.random() * 1.6 });
  });
  const identical = { key: 'same', label: 'Identical', probe: reference };
  const catches = Math.max(2, Math.round(order.length / 5));
  for (let i = 0; i < catches; i++) {
    order.push({ level: identical, sortKey: levels.length * (0.3 + Math.random() * 0.7) });
  }
  order.sort((x, y) => x.sortKey - y.sortKey);
  return order.map(({ level }) => {
    const probeIsB = Math.random() < 0.5;
    const a = probeIsB ? reference : level.probe;
    const b = probeIsB ? level.probe : reference;
    // Like the research, you name the better side, so the answer buttons line
    // up with the A and B buttons above them.
    const truth = a < b ? 'A' : b < a ? 'B' : 'same';
    return {
      levelKey: level.key,
      levelLabel: level.label,
      a: valueLabel(domain, a),
      b: valueLabel(domain, b),
      aValue: a,
      bValue: b,
      truth,
      answer: null,
    };
  });
}

export function renderLabIntro(app, domainKey) {
  const domain = LAB_DOMAINS[domainKey];
  const reference = domain.kind === 'overrun' ? `on time (${fpsLabel(1)})` : 'this phone as-is (+0 ms)';
  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">‹ Home</a>
      <h1>Lab: ${domain.title}</h1>
      <p>Each trial has two versions, <b>A</b> and <b>B</b>. ${domain.blurb}</p>
      <p>One side is always ${reference}; the other is slowed down, in random order. Switch between A and B as often as you like, then say which one was ${domain.better}, or if they felt the same. The slowdowns start big and get smaller, and some pairs are identical.</p>
      <p class="muted">${domain.research}</p>
      <label class="check"><input type="checkbox" id="reveal" checked> Show the answer after each trial</label>
      <div class="device-slot"></div>
      <button class="primary big" id="start">Start</button>
    </div>`;
  const stopDevice = deviceBar(app.querySelector('.device-slot'));
  app.querySelector('#start').addEventListener('click', () => {
    const reveal = app.querySelector('#reveal').checked;
    location.hash = `#/lab/${domainKey}/run${reveal ? '' : '?blind'}`;
  });
  return stopDevice;
}

export function renderLabRun(app, domainKey, params) {
  const domain = LAB_DOMAINS[domainKey];
  const reveal = !params.has('blind');
  const reps = Number(params.get('reps')) || 2;
  const levels = buildLevels(domain);
  const trials = buildTrials(domain, levels, reps);
  let index = 0;
  let side = 'A';
  let tried = { A: false, B: false };

  app.innerHTML = `
    <div class="run">
      <div class="run-top">
        <a class="back" href="#/lab/${domainKey}">‹</a>
        <div class="run-title">${domain.title} · <span class="trial-no"></span></div>
      </div>
      <div class="ab">
        <button data-side="A">A</button>
        <button data-side="B">B</button>
      </div>
      <div class="stage"></div>
      <div class="answers">
        <div class="hint"></div>
        <div class="answer-row">
          <button data-answer="A">A ${domain.better}</button>
          <button data-answer="same">Same</button>
          <button data-answer="B">B ${domain.better}</button>
        </div>
      </div>
      <div class="reveal hidden"></div>
    </div>`;

  const stage = app.querySelector('.stage');
  const hint = app.querySelector('.hint');
  const answerButtons = [...app.querySelectorAll('[data-answer]')];
  const sideButtons = [...app.querySelectorAll('[data-side]')];
  const revealBox = app.querySelector('.reveal');
  const experience = domain.make(stage, {
    onInteract: () => {
      tried[side] = true;
      updateControls();
    },
  });

  function setSide(next) {
    side = next;
    const trial = trials[index];
    experience.reset();
    domain.apply(experience, side === 'A' ? trial.aValue : trial.bValue);
    sideButtons.forEach((b) => b.classList.toggle('active', b.dataset.side === side));
    updateControls();
  }

  function updateControls() {
    const ready = tried.A && tried.B;
    answerButtons.forEach((b) => (b.disabled = !ready));
    if (ready) hint.textContent = `Which one was ${domain.better}?`;
    else if (!tried.A) hint.textContent = 'Try A first.';
    else if (side === 'A') hint.textContent = 'Now switch to B.';
    else hint.textContent = 'Try B.';
    sideButtons[1].classList.toggle('pulse', tried.A && !tried.B && side === 'A');
  }

  function startTrial() {
    tried = { A: false, B: false };
    app.querySelector('.trial-no').textContent = `trial ${index + 1} of ${trials.length}`;
    revealBox.classList.add('hidden');
    setSide('A');
  }

  sideButtons.forEach((b) => b.addEventListener('click', () => setSide(b.dataset.side)));
  answerButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const trial = trials[index];
      trial.answer = b.dataset.answer;
      if (reveal) showReveal(trial);
      else next();
    })
  );

  const answerText = (answer) => (answer === 'same' ? 'the same' : `${answer} ${domain.better}`);

  function showReveal(trial) {
    const right = trial.answer === trial.truth;
    revealBox.innerHTML = `
      <div class="reveal-card">
        <div class="verdict ${right ? 'right' : 'wrong'}">${right ? '✓ Right' : '✗ Not quite'}</div>
        <div>A: <b>${trial.a}</b> · B: <b>${trial.b}</b></div>
        <div>Truth: ${answerText(trial.truth)}. You said: ${answerText(trial.answer)}.</div>
        <button class="primary" id="next">${index + 1 < trials.length ? 'Next trial' : 'See results'}</button>
      </div>`;
    revealBox.classList.remove('hidden');
    revealBox.querySelector('#next').addEventListener('click', next);
  }

  function next() {
    index++;
    if (index < trials.length) startTrial();
    else finish();
  }

  function finish() {
    experience.destroy();
    const run = {
      id: Date.now(),
      date: new Date().toISOString(),
      domain: domainKey,
      title: domain.title,
      hz: Math.round(engine.hz),
      reveal,
      trials: trials.map(({ aValue, bValue, ...t }) => t),
    };
    saveRun(run);
    app.innerHTML = `
      <div class="page">
        <a class="back" href="#/">‹ Home</a>
        <h1>Results: ${domain.title}</h1>
        ${resultsHtml(run)}
        <p class="muted">${domain.research} Each row is only a few trials, so treat it as a demo, not a measurement. ${
          domain.kind === 'delay' ? '"+0 ms" is this phone as-is, which already has its own touch-to-screen delay.' : ''
        }</p>
        <div class="actions">
          <a class="button primary" href="#/lab/${domainKey}/run?${reveal ? '' : 'blind&'}again=${run.id}">Run again</a>
          <a class="button" href="#/history">All past runs</a>
        </div>
      </div>`;
  }

  startTrial();
  return () => experience.destroy();
}
