# Signal Quest

A mobile-first ASL fingerspelling trainer. Portrait canvas game, webcam hand
detection via MediaPipe, Duolingo-style lesson progression.

**Live:** https://signal-quest.vercel.app

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

The webcam and MediaPipe are loaded from a CDN in `index.html`, so hand
detection needs a network connection even in local dev.

## Deploying

`main` is connected to Vercel, so **pushing to `main` deploys to production**.

If the git connection is ever lost, the manual fallback is:

```bash
vercel --prod
```

Check the connection with `vercel project inspect signal-quest`, or reconnect
with `vercel git connect`.

## Architecture

Logical resolution is a fixed 160x288 portrait canvas, scaled to fit the screen.
All drawing happens in logical units; `Renderer.px()` converts to device pixels.

| File | Responsibility |
|---|---|
| `src/main.js` | Scene state machine, game loop, input, all scene draw/update |
| `src/renderer.js` | Canvas primitives, pixel-grid drawing, screen effects |
| `src/signs.js` | Landmark-based sign detectors, coaching hints, lesson zones |
| `src/gamestate.js` | Save file, progression, checkpoints, memory strength |
| `src/audio.js` | Web Audio chiptune/lofi engine, SFX, BGM, stingers |
| `src/handdraw.js` | Procedural hand drawing, used when a reference image fails |

Scenes are registered in three parallel maps at the bottom of `main.js`
(`sceneInits` / `sceneUpdates` / `sceneDraws`). Adding a scene means adding an
entry to each.

## Learning model

Two things gate and drive progression:

- **Checkpoints.** Finishing a lesson isn't enough to unlock the next one — its
  review checkpoint has to be cleared too. Checkpoints are receptive quizzes
  (read a shape, name it) rather than expressive practice, because in
  fingerspelling *reading* is the harder skill and doesn't come free from
  producing.
- **Memory strength.** Each sign carries `{ seen, correct, lastSeen, halfLifeDays }`.
  Predicted recall decays as `2^(-daysElapsed / halfLifeDays)`; a correct answer
  doubles the half-life, a lapse multiplies it by 0.4. Signs below 0.7 predicted
  recall surface as a `PRACTICE (n)` session on the home screen.

`masteredSigns` is deliberately kept as a separate permanent "have I ever learned
this" set — the map, the signs count and unlocks read it. Don't fold it into
strength.

## Dev-only helpers

Both are stripped from production builds by `import.meta.env.DEV`:

- Press `c` during the attempt phase to count the current sign without the
  camera. Useful for driving the lesson flow when there's no hand in frame.
- `window.__sqDev.peek()` dumps scene state; `window.__sqDev.step(n)` advances
  `n` frames deterministically. Scene state is module-scoped and
  `requestAnimationFrame` is frozen in a background tab, so neither is
  observable otherwise.

## Gotchas

**Reference images can fail to decode.** Four of the sign SVGs once shipped as
saved HTML error pages. `img.complete` is `true` for a *failed* load too, so the
obvious guard doesn't catch it — `Renderer.usable()` checks `naturalWidth > 0`
instead, and `drawSign()` falls back to the procedural hand. The game loop also
re-arms `requestAnimationFrame` in all cases; a throw used to kill it outright
and freeze the app.

**Detector accuracy is the weak point.** The detectors compare fingertip Y
against PIP joints, which assumes a roughly upright hand and degrades as the
wrist rotates. `isThumbExtended` still uses a thumb-tip-to-thumb-MCP distance
test, which is a poor discriminator — that distance is close to the thumb's own
length whichever way it points. It's left in place because A, C, K, L and Y
depend on it and K holds the thumb *over* the palm, so the better projection
metric (`thumbPalmPosition`) would break it. Fixing this properly needs captured
landmark fixtures from real hands to regression-test against.

## Assets

Sign references in `public/signs/` are from the WPClipart ASL alphabet series
(edited by Paul Sherman), public domain. `upload.wikimedia.org` returns 403
without a descriptive User-Agent — that's how the error pages got saved as
`.svg` in the first place.
