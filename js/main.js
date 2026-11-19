import { engine } from './engine.js';
import { renderLabIntro, renderLabRun, LAB_DOMAINS } from './lab.js';
import { renderPlayground } from './playground.js';
import { deviceBar } from './device.js';
import { loadRuns, renderHistory } from './history.js';

const app = document.getElementById('app');
let cleanup = null;

function runsCount() {
  const n = loadRuns().length;
  return n ? ` (${n})` : '';
}

function renderHome() {
  app.innerHTML = `
    <div class="page">
      <h1>Feel the lag</h1>
      <p class="lede">How much slower does an app have to be before you notice? It depends a lot on what you're doing.</p>

      <h2>Lab</h2>
      <p class="muted">Compare two versions blind and say which was faster. The gap shrinks until you can't tell.</p>
      <div class="cards">
        ${Object.entries(LAB_DOMAINS)
          .map(([key, d]) => `<a class="card" href="#/lab/${key}"><b>${d.title}</b><span>${d.research}</span></a>`)
          .join('')}
      </div>

      <a class="history-link" href="#/history">Your past runs${runsCount()}</a>

      <h2>Playground</h2>
      <p class="muted">Pick a delay and feel it.</p>
      <div class="cards">
        <a class="card" href="#/play/tap"><b>Tap response</b><span>Delay how quickly a keypad shows your taps.</span></a>
        <a class="card" href="#/play/scroll"><b>Scroll</b><span>Add latency, lower the frame rate, or drop frames.</span></a>
      </div>

      <h2>Why taps and motion differ</h2>
      <p>When you tap, you judge cause and effect: did the screen react to me? Feedback within about 100 ms feels caused by your tap, and the average person only notices added tap latency around <b>69 ms</b>.</p>
      <p>When you drag or scroll, your finger is a moving reference point and the content is visibly behind it. People notice about <b>11 ms</b> of added latency there. That is less than one frame at 60 Hz (16.7 ms), so a single late or missed frame during a scroll is noticeable.</p>

      <h2>Latency or slow frames?</h2>
      <p>Both come from code, but from different mistakes, and they feel different. Try each tab of the scroll playground.</p>
      <p><b>Slow frames:</b> the app has more work to do for a frame than fits before the next refresh: creating and binding new list rows, layout, decoding images, reading from disk. The frame misses its refresh, so the previous one stays on screen. If every frame is over budget, the frame rate drops <i>and</i> what you see is older. If only some are (a garbage collection pause, one expensive row), the scroll stutters: that's jank. Profilers show these as long frames.</p>
      <p><b>Latency with smooth frames:</b> every frame is on time, but it shows an old touch. Nothing is slow; there are just extra steps between the touch and the frame that uses it, and each one usually costs a whole frame. The touch is handled in a callback posted for later, a state update goes through an async hop (a coroutine or promise that resumes on the next frame) before it's rendered, or the rendering pipeline queued extra frames after falling behind once and never caught up. A profiler shows nothing wrong, which is why this is easy to miss.</p>

      <h2>What "+0 ms" means</h2>
      <p>Every phone already has its own delay between your finger and the pixels: the touch sensor, the OS, the browser, and the display. A web page can't measure that, so everything here is added <i>on top of</i> this phone's own delay. Phones measured with high-speed cameras typically land around 50 to 100+ ms for a tap. Delays are added in whole frames, because the screen can only change once per refresh.</p>
      <div class="device-slot"></div>

      <h2>Sources</h2>
      <ul class="sources">
        <li>Deber, Jota, Forlines, Wigdor. <a href="https://dl.acm.org/doi/10.1145/2702123.2702300">How Much Faster is Fast Enough? User Perception of Latency &amp; Latency Improvements in Direct and Indirect Touch</a>. CHI 2015. 69 ms for taps, 11 ms for drags.</li>
        <li>Jota, Ng, Dietz, Wigdor. <a href="https://www.tactuallabs.com/papers/howFastIsFastEnoughCHI13.pdf">How Fast is Fast Enough?</a> CHI 2013. The A/B "which was faster" staircase this lab is modeled on.</li>
        <li>web.dev: <a href="https://web.dev/articles/defining-core-web-vitals-thresholds">How the Core Web Vitals thresholds were defined</a>. Why INP is 200 ms when research says 100 ms.</li>
        <li>Ink &amp; Switch: <a href="https://www.inkandswitch.com/slow-software/">Slow Software</a>.</li>
        <li>James Darpinian: <a href="https://james.darpinian.com/blog/latency/">Why Your Input Latency is Bad</a>. Phil Walton: <a href="https://chrome.dev/inp-demo/">INP demo</a>.</li>
      </ul>
    </div>`;
  return deviceBar(app.querySelector('.device-slot'));
}

function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  document.body.classList.toggle('fullscreen', parts.length >= 2 && (parts[0] === 'play' || parts[2] === 'run'));

  if (parts[0] === 'lab' && LAB_DOMAINS[parts[1]]) {
    cleanup = parts[2] === 'run' ? renderLabRun(app, parts[1], params) : renderLabIntro(app, parts[1]);
  } else if (parts[0] === 'history') {
    renderHistory(app);
  } else if (parts[0] === 'play' && (parts[1] === 'tap' || parts[1] === 'scroll')) {
    cleanup = renderPlayground(app, parts[1]);
  } else {
    cleanup = renderHome();
  }
}

// Wait for the refresh rate measurement so delays are whole frames of this display.
await Promise.race([engine.ready, new Promise((r) => setTimeout(r, 1500))]);
addEventListener('hashchange', route);
route();
