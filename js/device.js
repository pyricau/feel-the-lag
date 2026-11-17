import { engine, isIOS } from './engine.js';

/** A live line about what this device can and can't show. Returns a stop function. */
export function deviceBar(el) {
  el.classList.add('device');
  const update = () => {
    const hz = Math.round(engine.hz);
    const input = engine.inputDelayMs;
    const parts = [`Display: <b>${hz} Hz</b> (1 frame = ${engine.frameMs.toFixed(1)} ms)`];
    if (input !== null) parts.push(`browser input → frame: <b>${Math.round(input)} ms</b>`);
    let warning = '';
    if (hz < 50) {
      warning = `Only ${hz} frames per second. ${
        isIOS ? 'Low Power Mode caps iPhones at 30 Hz: turn it off.' : 'Battery saver may be on: turn it off.'
      }`;
    } else if (isIOS && hz < 70) {
      warning = 'iPhone Safari caps web pages at 60 Hz, so "smooth" here means 60 fps.';
    }
    el.innerHTML = `<div>${parts.join(' · ')}</div>${warning ? `<div class="warn">${warning}</div>` : ''}`;
  };
  update();
  const timer = setInterval(update, 500);
  return () => clearInterval(timer);
}
