# Feel the lag

A static web demo that lets people feel UI performance thresholds on their own phone:

- **Tap response**: people notice about 69 ms of added tap latency.
- **Motion** (dragging/scrolling): people notice about 11 ms of added latency, less than one 60 Hz frame.

Two modes:

- **Lab**: blind A/B trials ("was B faster, slower, or about the same as A?"), gaps shrinking from obvious to
  imperceptible, with identical pairs mixed in. Results show where you stopped being able to tell.
- **Playground**: set a tap delay, scroll latency, frame rate or dropped-frame rate and feel it.

No build step and no backend: open `index.html` through any static server (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000
```

## How delays work

- One `requestAnimationFrame` loop drives everything, and every added delay is a whole number of display frames
  (the screen can only change once per refresh). The refresh rate is measured at startup.
- Only the *visual response* is delayed: input is handled immediately, and the keypad's highlight and digit, or the
  scroller's rendered position, are applied N frames later.
- Scrolling uses a custom scroller (native scrolling can't be delayed or throttled from JS), with iOS-style
  deceleration (0.998/ms) and rubber-banding. It simulates the true position every frame and renders the one from N
  frames ago (latency), only every H frames (frame rate), or skips random frames (jank).
- "+0 ms" is the phone as-is. Its own touch-to-screen delay can't be measured from a web page; phones are typically
  50 to 100+ ms.

On iPhone, Safari caps pages at 60 Hz, and Low Power Mode caps them at 30 Hz.

## Sources

- Deber, Jota, Forlines, Wigdor. *How Much Faster is Fast Enough?* CHI 2015. https://dl.acm.org/doi/10.1145/2702123.2702300
- Jota, Ng, Dietz, Wigdor. *How Fast is Fast Enough?* CHI 2013. https://www.tactuallabs.com/papers/howFastIsFastEnoughCHI13.pdf
- web.dev, *How the Core Web Vitals metrics thresholds were defined*. https://web.dev/articles/defining-core-web-vitals-thresholds
- Ink & Switch, *Slow Software*. https://www.inkandswitch.com/slow-software/
