// Lab runs are kept in localStorage on this device only; nothing leaves the phone.

const KEY = 'feel-the-lag.runs';

export function loadRuns() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function saveRun(run) {
  try {
    localStorage.setItem(KEY, JSON.stringify([run, ...loadRuns()]));
  } catch {
    // Storage full or disabled (some private modes): results still show, just aren't kept.
  }
}

function clearRuns() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Size of the probe encoded in a level key ("d4" = 4 frames late, "h2" = every 2nd refresh). */
const magnitude = (key) => (key === 'same' ? -1 : Number(key.slice(1)));

function groupByLevel(trials) {
  const groups = new Map();
  for (const t of trials) {
    if (!groups.has(t.levelKey)) groups.set(t.levelKey, { key: t.levelKey, label: t.levelLabel, trials: [] });
    groups.get(t.levelKey).trials.push(t);
  }
  return [...groups.values()].sort((x, y) => magnitude(y.key) - magnitude(x.key));
}

const isRight = (t) => t.answer === t.truth;
const reliable = (g) => g.trials.filter(isRight).length >= Math.ceil((g.trials.length * 2) / 3);

export function headline(run) {
  const groups = groupByLevel(run.trials).filter((g) => g.key !== 'same');
  let spotted = -1;
  while (spotted + 1 < groups.length && reliable(groups[spotted + 1])) spotted++;
  if (spotted < 0) return `You didn't reliably spot even <b>${groups[0].label}</b>.`;
  const last = groups[spotted];
  let text = `You reliably spotted the difference down to <b>${last.label}</b>.`;
  if (spotted === groups.length - 1) {
    text += last.key === 'd1' ? ' That is a single frame, the smallest step this display can show.' : ' That is every level in this lab.';
  } else {
    text += ' Below that, you were mostly guessing.';
  }
  return text;
}

function cell(t) {
  const identical = t.truth === 'same';
  const symbol = t.answer === 'same' ? '=' : identical || !isRight(t) ? '✗' : '✓';
  const said = t.answer === 'same' ? 'about the same' : `B ${t.answer}`;
  return `<span class="cell ${isRight(t) ? 'right' : 'wrong'}" title="A ${t.a} · B ${t.b} · you said ${said}">${symbol}</span>`;
}

export function resultsHtml(run) {
  const groups = groupByLevel(run.trials);
  const identical = groups.find((g) => g.key === 'same');
  const rows = groups
    .map(
      (g) => `
      <div class="res-row">
        <div class="res-label">${g.label}</div>
        <div class="cells">${g.trials.map(cell).join('')}</div>
        <div class="res-count">${g.trials.filter(isRight).length}/${g.trials.length}</div>
      </div>`
    )
    .join('');
  const sameCount = identical ? identical.trials.filter(isRight).length : 0;
  const table = run.trials
    .map(
      (t, i) => `<tr><td>${i + 1}</td><td>${t.a}</td><td>${t.b}</td><td>${t.truth}</td><td>${t.answer}</td><td>${
        isRight(t) ? '✓' : '✗'
      }</td></tr>`
    )
    .join('');
  return `
    <p class="headline">${headline(run)}</p>
    ${identical ? `<p class="muted">On identical pairs you said "about the same" ${sameCount} of ${identical.trials.length} times.</p>` : ''}
    <div class="legend">
      <span><i class="cell right">✓</i>right</span>
      <span><i class="cell wrong">✗</i>wrong</span>
      <span><i class="cell wrong">=</i>you said "about the same"</span>
    </div>
    <div class="results">${rows}</div>
    <details><summary>All trials</summary>
      <table class="trials"><thead><tr><th>#</th><th>A</th><th>B</th><th>B was</th><th>You said</th><th></th></tr></thead>
      <tbody>${table}</tbody></table>
    </details>`;
}

export function renderHistory(app) {
  const runs = loadRuns();
  const items = runs
    .map(
      (run) => `
      <details class="run-item">
        <summary>
          <div class="run-item-head"><b>${run.title}</b><span>${new Date(run.date).toLocaleString()} · ${run.hz} Hz${
        run.reveal ? '' : ' · blind'
      }</span></div>
          <div class="run-item-headline">${headline(run)}</div>
        </summary>
        ${resultsHtml(run)}
      </details>`
    )
    .join('');
  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">‹ Home</a>
      <h1>Past runs</h1>
      <p class="muted">Saved on this device only.</p>
      ${runs.length ? items : '<p>No lab runs yet.</p>'}
      ${runs.length ? '<button id="clear">Delete all runs</button>' : ''}
    </div>`;
  app.querySelector('#clear')?.addEventListener('click', () => {
    if (confirm('Delete all saved runs on this device?')) {
      clearRuns();
      renderHistory(app);
    }
  });
}
