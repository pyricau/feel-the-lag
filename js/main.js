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
      <p class="muted">Compare two versions blind and say which was faster. The gap starts big and gets smaller, and the results show the smallest one you could still tell.</p>
      <div class="cards">
        ${Object.entries(LAB_DOMAINS)
          .map(([key, d]) => `<a class="card" href="#/lab/${key}"><b>${d.title}</b><span>${d.question}</span></a>`)
          .join('')}
      </div>

      <a class="history-link" href="#/history">Your past runs${runsCount()}</a>

      <h2>Playground</h2>
      <p class="muted">Pick a delay and feel it.</p>
      <div class="cards">
        <a class="card" href="#/play/tap"><b>Tap response</b><span>Delay how quickly a keypad shows your taps.</span></a>
        <a class="card" href="#/play/scroll"><b>Scroll</b><span>Add latency, lower the frame rate, or slow down or freeze frames. Try each tab and see which feels worst.</span></a>
      </div>

      <h2>Why taps and motion differ</h2>
      <p>When you tap, you judge cause and effect: did the screen react to me? Feedback within about 100 ms feels caused by your tap.<sup class="ref">[3]</sup> Added to a screen that reacts almost instantly, people only notice tap latency from about <b>69 ms</b>.<sup class="ref">[1]</sup> (Noticing here means picking the faster of two versions 3 times out of 4, where guessing gets 2 out of 4.) On a screen that already lags, as phones do, taking away about 33 to 50 ms is enough to notice, while a single frame (17 ms) mostly isn't. And below about 33 ms in total, from finger to pixels, people couldn't tell any improvement at all.<sup class="ref">[1]</sup></p>
      <p>When you drag or scroll, your finger is a moving reference point and the content is visibly behind it. People notice about <b>11 ms</b> of added latency there,<sup class="ref">[1]</sup> less than one frame at 60 Hz (16.7 ms). That was also measured on an almost instant screen, but it holds up on slower ones: taking a single 60 Hz frame away from a drag reached or came close to the same bar at every starting latency tested, from 8 to 167 ms.<sup class="ref">[1]</sup> So one extra frame of latency while dragging is something people can feel. (The study added steady latency; it didn't test dropped or slow frames.)</p>

      <h2>Latency or slow frames?</h2>
      <p>Both come from code, but from different mistakes, and they feel different. Try each tab of the scroll playground.</p>
      <p><b>Slow frames:</b> the app has more work to do for a frame than fits before the next refresh: creating and binding new list rows, layout, decoding images, reading from disk. The frame misses its refresh, so the previous one stays on screen. If every frame is over budget, the frame rate drops <i>and</i> what you see is older. If only some are (a garbage collection pause, one expensive row), the scroll stutters: that's jank. Profilers show these as long frames.</p>
      <p><b>Latency with smooth frames:</b> every frame is on time, but it shows an old touch. Nothing is slow; there are just extra steps between the touch and the frame that uses it, and each one usually costs a whole frame. The touch is handled in a callback posted for later, a state update goes through an async hop (a coroutine or promise that resumes on the next frame) before it's rendered, or the rendering pipeline queued extra frames after falling behind once and never caught up. A profiler shows nothing wrong, which is why this is easy to miss.</p>

      <h2>What "+0 ms" means</h2>
      <p>Every phone already has its own delay between your finger and the pixels: the touch sensor, the OS, the browser, and the display. A web page can't measure all of it, so everything here is added <i>on top of</i> this phone's own delay. In 2017, Dan Luu filmed phones scrolling a web page and measured 70 to 90 ms from the finger moving to the first change on screen on iPhones, and 110 to 180 ms on Android phones.<sup class="ref">[4]</sup> Delays are added in whole frames, because the screen can only change once per refresh.</p>
      <div class="device-slot"></div>

      <h2>Sources</h2>
      <ol class="sources">
        <li>Deber, Jota, Forlines, Wigdor. <a href="https://www.tactuallabs.com/papers/howMuchFasterIsFastEnoughCHI15.pdf">How Much Faster is Fast Enough? User Perception of Latency &amp; Latency Improvements in Direct and Indirect Touch</a>. CHI 2015. Thresholds for added latency (69 ms tap, 11 ms drag) and for improvements from starting latencies of 8 to 167 ms.</li>
        <li>Jota, Ng, Dietz, Wigdor. <a href="https://www.tactuallabs.com/papers/howFastIsFastEnoughCHI13.pdf">How Fast is Fast Enough?</a> CHI 2013. The A/B "which was faster" method this lab is modeled on.</li>
        <li>web.dev: <a href="https://web.dev/articles/defining-core-web-vitals-thresholds">How the Core Web Vitals thresholds were defined</a>. The research behind 100 ms, and why INP is 200 ms anyway.</li>
        <li>Dan Luu: <a href="https://danluu.com/input-lag/">Computer latency: 1977-2017</a>. Phones and computers filmed at 240 and 1000 fps.</li>
        <li>Li, Zhu, Qiu, Du, Du. <a href="https://www.tandfonline.com/doi/full/10.1080/0144929X.2025.2462266">Higher refresh rate does not necessarily improve scrolling experience on mobile phones</a>. Behaviour &amp; Information Technology, 2025. 90 and 120 Hz scrolling rated smoother than 60 Hz, little difference between 90 and 120.</li>
        <li>Janzen, Teather. <a href="https://www.csit.carleton.ca/~rteather/pdfs/Frame_Rate_Latency.pdf">Is 60 FPS Better than 30? The Impact of Frame Rate and Latency on Moving Target Selection</a>. CHI 2014 extended abstracts. Mouse, not touch: dropping from 60 to 30 fps hurt more than the latency it adds.</li>
      </ol>
      <h2>Further reading</h2>
      <ul class="sources">
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
