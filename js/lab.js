import { engine, msLabel, fpsLabel } from './engine.js';
import { Keypad } from './keypad.js';
import { Scroller } from './scroller.js';
import { deviceBar } from './device.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const LAB_DOMAINS = {
  tap: {
    title: 'Tap response',
    blurb: 'Tap the keypad. One of A and B shows your taps later than the other, or they are identical.',
    research: 'People notice about 69 ms of added tap latency on a touchscreen (Deber et al., CHI 2015).',
    make: (root, opts) => new Keypad(root, opts),
    apply: (exp, value) => exp.setDelayFrames(value),
    kind: 'delay',
    gapsMs: [150, 100, 67, 33, 17],
    basesMs: [0, 17, 33, 50],
    words: { faster: 'B faster', slower: 'B slower' },
  },
  scroll: {
    title: 'Scroll latency',
    blurb: 'Drag the list slowly up and down, watch a row under your finger. One of A and B follows your finger later than the other, or they are identical.',
    research: 'People notice about 11 ms of added drag latency on a touchscreen (Deber et al., CHI 2015).',
    make: (root, opts) => new Scroller(root, opts),
    apply: (exp, value) => exp.setLatencyFrames(value),
    kind: 'delay',
    gapsMs: [100, 67, 33, 17, 8],
    basesMs: [0, 17, 33],
    words: { faster: 'B faster', slower: 'B slower' },
  },
  fps: {
    title: 'Scroll frame rate',
    blurb: 'Fling and drag the list. One of A and B draws fewer frames per second than the other, or they are identical.',
    research: 'At 60 Hz each frame lasts 16.7 ms, already more than the ~11 ms people notice while dragging.',
    make: (root, opts) => new Scroller(root, opts),
    apply: (exp, value) => exp.setHold(value),
    kind: 'hold',
    // Pairs of "hold each frame for N refreshes"; first is the smoother one.
    pairs: [[1, 4], [1, 3], [1, 2], [2, 3]],
    catchPairs: [[1, 1], [2, 2]],
    words: { faster: 'B smoother', slower: 'B choppier' },
  },
};

function valueLabel(domain, value) {
  return domain.kind === 'delay' ? `+${msLabel(value)}` : fpsLabel(value);
}

/** Levels from biggest to smallest difference, resolved to whole frames for this display. */
function buildLevels(domain) {
  const frameMs = engine.frameMs;
  if (domain.kind === 'hold') {
    return domain.pairs.map(([lo, hi]) => ({
      key: `${lo}:${hi}`,
      label: `${fpsLabel(lo)} vs ${fpsLabel(hi)}`,
      values: () => [lo, hi],
    }));
  }
  const seen = new Set();
  const levels = [];
  for (const ms of domain.gapsMs) {
    const gap = Math.round(ms / frameMs);
    if (gap < 1 || seen.has(gap)) continue;
    seen.add(gap);
    levels.push({
      key: `g${gap}`,
      label: `${msLabel(gap)} gap`,
      values: () => {
        const base = Math.round(pick(domain.basesMs) / frameMs);
        return [base, base + gap];
      },
    });
  }
  return levels;
}

function buildTrials(domain, levels, reps) {
  const trials = [];
  levels.forEach((level, index) => {
    for (let r = 0; r < reps; r++) {
      // Roughly biggest gaps first, narrowing, with some mixing.
      trials.push({ level, sortKey: index + Math.random() * 1.6 });
    }
  });
  const catchLevel = {
    key: 'same',
    label: 'Identical',
    values: () => {
      if (domain.kind === 'hold') return pick(domain.catchPairs);
      const base = Math.round(pick(domain.basesMs) / engine.frameMs);
      return [base, base];
    },
  };
  const catches = Math.max(2, Math.round(trials.length / 5));
  for (let i = 0; i < catches; i++) {
    trials.push({ level: catchLevel, sortKey: levels.length * (0.3 + Math.random() * 0.7) });
  }
  trials.sort((a, b) => a.sortKey - b.sortKey);
  return trials.map(({ level }) => {
    const [lo, hi] = level.values();
    const swap = Math.random() < 0.5;
    const a = swap ? hi : lo;
    const b = swap ? lo : hi;
    const truth = b > a ? 'slower' : b < a ? 'faster' : 'same';
    return { level, a, b, truth, answer: null };
  });
}

export function renderLabIntro(app, domainKey) {
  const domain = LAB_DOMAINS[domainKey];
  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">‹ Home</a>
      <h1>Lab: ${domain.title}</h1>
      <p>Each trial has two versions, <b>A</b> and <b>B</b>. ${domain.blurb}</p>
      <p>Switch between A and B as often as you like, then say how B compared to A. The differences start big and get smaller.</p>
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
          <button data-answer="faster">${domain.words.faster}</button>
          <button data-answer="same">About the same</button>
          <button data-answer="slower">${domain.words.slower}</button>
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
    domain.apply(experience, side === 'A' ? trial.a : trial.b);
    sideButtons.forEach((b) => b.classList.toggle('active', b.dataset.side === side));
    updateControls();
  }

  function updateControls() {
    const ready = tried.A && tried.B;
    answerButtons.forEach((b) => (b.disabled = !ready));
    if (ready) hint.textContent = 'How did B compare to A?';
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

  function answerText(answer) {
    return answer === 'same' ? 'about the same' : domain.words[answer];
  }

  function showReveal(trial) {
    const right = trial.answer === trial.truth;
    revealBox.innerHTML = `
      <div class="reveal-card">
        <div class="verdict ${right ? 'right' : 'wrong'}">${right ? '✓ Right' : '✗ Not quite'}</div>
        <div>A: <b>${valueLabel(domain, trial.a)}</b> · B: <b>${valueLabel(domain, trial.b)}</b></div>
        <div>Truth: ${answerText(trial.truth)}. You said: ${answerText(trial.answer)}.</div>
        <button class="primary" id="next">${index + 1 < trials.length ? 'Next trial' : 'See results'}</button>
      </div>`;
    revealBox.classList.remove('hidden');
    revealBox.querySelector('#next').addEventListener('click', next);
  }

  function next() {
    index++;
    if (index < trials.length) startTrial();
    else showResults();
  }

  function showResults() {
    experience.destroy();
    renderResults(app, domainKey, domain, trials, reveal);
  }

  startTrial();
  return () => experience.destroy();
}

function renderResults(app, domainKey, domain, trials, reveal) {
  const groups = new Map();
  for (const t of trials) {
    if (!groups.has(t.level.key)) groups.set(t.level.key, { level: t.level, trials: [] });
    groups.get(t.level.key).trials.push(t);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.level.key === 'same') - (b.level.key === 'same'));

  const rows = ordered
    .map(({ level, trials: ts }) => {
      const n = ts.length;
      const right = ts.filter((t) => t.answer === t.truth).length;
      const same = level.key === 'same' ? 0 : ts.filter((t) => t.answer === 'same').length;
      const wrong = n - right - same;
      const seg = (count, cls, label) =>
        count ? `<div class="seg ${cls}" style="flex:${count}" title="${label}: ${count} of ${n}"></div>` : '';
      return `
        <div class="res-row">
          <div class="res-label">${level.label}</div>
          <div class="bar">${seg(right, 'right', 'Right')}${seg(same, 'same', 'Said "same"')}${seg(wrong, 'wrong', 'Wrong')}</div>
          <div class="res-count">${right}/${n}</div>
        </div>`;
    })
    .join('');

  const table = trials
    .map(
      (t, i) => `<tr><td>${i + 1}</td><td>${valueLabel(domain, t.a)}</td><td>${valueLabel(domain, t.b)}</td>
        <td>${t.truth}</td><td>${t.answer}</td><td>${t.answer === t.truth ? '✓' : '✗'}</td></tr>`
    )
    .join('');

  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">‹ Home</a>
      <h1>Results: ${domain.title}</h1>
      <div class="legend">
        <span><i class="sw right"></i>Right</span>
        <span><i class="sw same"></i>Said "about the same"</span>
        <span><i class="sw wrong"></i>Wrong way round</span>
      </div>
      <div class="results">${rows}</div>
      <p>Where the green runs out, you were guessing: below that difference, faster and slower feel the same.</p>
      <p class="muted">${domain.research} Each row is only a few trials, so treat it as a demo, not a measurement. "+0 ms" is this phone as-is, which already has its own touch-to-screen delay.</p>
      <details><summary>All trials</summary>
        <table class="trials"><thead><tr><th>#</th><th>A</th><th>B</th><th>B was</th><th>You said</th><th></th></tr></thead>
        <tbody>${table}</tbody></table>
      </details>
      <div class="actions">
        <a class="button primary" href="#/lab/${domainKey}/run?${reveal ? '' : 'blind&'}again=${Date.now()}">Run again</a>
        <a class="button" href="#/">Home</a>
      </div>
    </div>`;
}
