// Temporal segmentation for fingerspelling.
//
// A single-letter lesson can get away with "hold the shape for 1.2 seconds".
// Spelling a word can't — nobody fingerspells at one letter per 1.2s with a
// full stop between. Letters have to be picked out of continuous movement: the
// hand settles into a shape, changes, settles into the next.
//
// Two signals, because fingerspelling moves in two different ways:
//
//   shape   — fingertip motion with hand translation removed. This is what
//             actually changes between letters. Measuring raw fingertip
//             position instead would confuse "moved my hand" with "changed
//             the letter"; measuring the wrist and knuckles would miss letter
//             changes entirely, since spelling holds the hand roughly still
//             and articulates the fingers (going A -> B moves the anchors by
//             ~0 and the fingertips by ~0.7 handScale).
//
//   travel  — wrist and knuckle motion. Needed for doubled letters: ASL marks
//             LL with a small bounce or slide, which is constant shape and
//             moving hand. Without this, the second L would never re-arm.
//
// Deliberately knows nothing about ASL — the letter detector is injected — so
// it can be unit-tested with synthetic motion.

const ANCHORS = [0, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

export const MOTION_TUNING = {
  bufferMs: 1500,
  // Both velocities are in handScale-widths per millisecond, so they don't
  // change with distance from the camera.
  // NOTE: these are reasoned starting points, not measured off real hands.
  // Expose them in the dev harness and tune against captured motion.
  settleShape: 0.0010,   // below this the handshape counts as held
  moveShape: 0.0020,     // above this the shape is changing between letters
  // Travel is much slower than shape change. A letter transition whips the
  // fingertips ~0.7 handScale in a few frames (~0.004/ms), but drawing a J
  // moves the whole hand only ~1 handScale over most of a second (~0.0011/ms).
  // The first values here were set for shape-change speeds and read a natural
  // J as stationary, so it never registered as a gesture at all.
  settleTravel: 0.0005,  // above hand tremor (~0.0003), below the slowest gesture
  moveTravel: 0.0009,    // catches a slow, small J; a doubled-letter bounce is ~0.0015
  settleFrames: 4,       // consecutive settled frames on the same letter
};

function handScaleOf(lm) {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.15;
}

function centroid(lm, ids) {
  let x = 0, y = 0;
  for (const i of ids) { x += lm[i].x; y += lm[i].y; }
  return { x: x / ids.length, y: y / ids.length };
}

// Fingertip motion with translation removed — "how fast is the shape changing".
function shapeVelocity(prev, curr, dtMs) {
  if (!prev || !curr || dtMs <= 0) return 0;
  const cp = centroid(prev, ANCHORS), cc = centroid(curr, ANCHORS);
  let sum = 0;
  for (const i of TIPS) {
    sum += Math.hypot(
      (curr[i].x - cc.x) - (prev[i].x - cp.x),
      (curr[i].y - cc.y) - (prev[i].y - cp.y),
    );
  }
  return (sum / TIPS.length) / handScaleOf(curr) / dtMs;
}

// Whole-hand motion — "is the hand being moved".
function travelVelocity(prev, curr, dtMs) {
  if (!prev || !curr || dtMs <= 0) return 0;
  const cp = centroid(prev, ANCHORS), cc = centroid(curr, ANCHORS);
  return Math.hypot(cc.x - cp.x, cc.y - cp.y) / handScaleOf(curr) / dtMs;
}

// ─── Motion letters (J and Z) ──────────────────────────
// J and Z aren't handshapes, they're paths: hold a shape and draw the letter in
// the air. J is the I hand with the pinky tracing a hook; Z is an index finger
// drawing a zigzag.
//
// MIRRORING: matching is tried against the template and its horizontal mirror,
// and either counts. That deliberately sidesteps three things at once — left
// vs right hand, the mirrored camera preview, and whether the path is drawn
// from the signer's or the viewer's perspective. Nothing else in the letter set
// is a mirrored J or Z, so accepting both costs no discrimination, and getting
// the chirality wrong by reasoning is exactly the mistake worth designing out.
export const MOTION_LETTERS = {
  // y grows downward in image space
  J: { base: 'I', tip: 20, strokes: [[0, 1], [-1, -0.35]] },        // down, then hook
  Z: { base: 'D', tip: 8, strokes: [[1, 0], [-1, 1], [1, 0]] },     // across, diagonal back, across
};

const norm = ([x, y]) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m]; };

// Total path length, in handScale units.
function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

// Each of k equal-arc-length chunks, as a net direction plus how directly it
// travelled. Chunking by length rather than detecting corners keeps this stable
// under hand tremor — a corner detector fires on noise, this can't.
//
// `straightness` is net displacement over distance travelled: ~1 for a real
// stroke, ~0.2 for a random walk. Without it a chaotic scribble scores as a Z,
// because three arbitrary net directions land within tolerance often enough.
function chunkDirections(pts, k) {
  const total = pathLength(pts);
  if (total <= 0) return [];
  const per = total / k;
  const out = [];
  let acc = 0, start = pts[0], idx = 1, travelled = 0;
  for (let c = 0; c < k; c++) {
    const target = per * (c + 1);
    travelled = 0;
    while (idx < pts.length && acc < target) {
      const step = Math.hypot(pts[idx].x - pts[idx - 1].x, pts[idx].y - pts[idx - 1].y);
      acc += step; travelled += step;
      idx++;
    }
    const end = pts[Math.min(idx, pts.length) - 1];
    const net = Math.hypot(end.x - start.x, end.y - start.y);
    out.push({ dir: norm([end.x - start.x, end.y - start.y]), straightness: travelled ? net / travelled : 0 });
    start = end;
  }
  return out;
}

const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));

// Mean angular error between the path and a template, best of the two mirrors.
// Infinity if the path is too short to be an intentional gesture.
export function strokeError(pts, template, { minLength = 0.6, minStraightness = 0.55 } = {}) {
  if (!pts || pts.length < template.length + 1) return Infinity;
  if (pathLength(pts) < minLength) return Infinity;   // ignore jitter
  const chunks = chunkDirections(pts, template.length);
  if (chunks.length !== template.length) return Infinity;
  // Every stroke has to actually go somewhere, or this is a scribble
  if (chunks.some(c => c.straightness < minStraightness)) return Infinity;
  const err = flip => template.reduce((sum, t, i) =>
    sum + angleBetween(chunks[i].dir, norm([flip * t[0], t[1]])), 0) / template.length;
  return Math.min(err(1), err(-1));
}

export function matchesStrokes(pts, template, { tolerance = Math.PI / 4 } = {}) {
  return strokeError(pts, template) <= tolerance;
}

// Which motion letter, if any, this path traces.
//
// Templates must be scored against each other rather than tested one at a time.
// Chunking a Z into two segments produces something J-shaped, so testing J
// alone accepts a Z. Requiring the winner to beat the runner-up by a margin
// removes that whole class of confusion.
export function bestMotionMatch(pts, { tolerance = Math.PI / 4, margin = 0.25 } = {}) {
  const scored = Object.entries(MOTION_LETTERS)
    .map(([letter, def]) => ({ letter, err: strokeError(pts, def.strokes) }))
    .sort((a, b) => a.err - b.err);
  const best = scored[0];
  if (!best || best.err > tolerance) return null;
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.err - best.err < margin) return null;   // too ambiguous
  return best.letter;
}

export class SpellTracker {
  constructor(tuning = {}) {
    this.tuning = { ...MOTION_TUNING, ...tuning };
    this.reset();
  }

  reset() {
    this.buf = [];
    this.state = 'idle';     // 'idle' | 'moving' | 'settled'
    this.stableLetter = null;
    this.stableCount = 0;
    // Whether a settle may emit. Cleared on emit, set again by movement — so
    // holding one shape can't fire twice, while a real doubled letter re-arms
    // on the bounce ASL uses to mark it.
    this.armed = true;
    this.shape = 0;
    this.travel = 0;
  }

  // A fingertip's path through the buffer, moved to the origin and scaled by
  // hand size so it doesn't depend on where in frame it was drawn or how far
  // from the camera.
  tipPath(tipIndex) {
    if (this.buf.length < 4) return [];
    const s = handScaleOf(this.buf[0].landmarks);
    const p0 = this.buf[0].landmarks[tipIndex];
    return this.buf.map(f => ({
      x: (f.landmarks[tipIndex].x - p0.x) / s,
      y: (f.landmarks[tipIndex].y - p0.y) / s,
    }));
  }

  // Did the hand just draw a J or a Z?
  //
  // The base handshape does the disambiguating here — J is drawn with an I hand
  // and Z with a pointing hand — so only one template is ever in play and the
  // two can't be confused with each other.
  motionMatch(detect) {
    if (this.buf.length < 8) return null;
    const mid = this.buf[Math.floor(this.buf.length / 2)].landmarks;
    const base = detect(mid);
    for (const [letter, def] of Object.entries(MOTION_LETTERS)) {
      if (def.base !== base) continue;
      if (matchesStrokes(this.tipPath(def.tip), def.strokes)) return letter;
    }
    return null;
  }

  // detect(landmarks) -> letter | null. Returns what happened this frame.
  update(landmarks, nowMs, detect) {
    if (!landmarks) {
      this.buf = [];
      this.state = 'idle';
      this.stableLetter = null;
      this.stableCount = 0;
      this.armed = true;
      this.shape = this.travel = 0;
      return { emitted: null, state: 'idle', shape: 0, travel: 0, letter: null };
    }

    const prev = this.buf[this.buf.length - 1];
    const dt = prev ? nowMs - prev.t : 0;
    this.shape = shapeVelocity(prev?.landmarks, landmarks, dt);
    this.travel = travelVelocity(prev?.landmarks, landmarks, dt);

    this.buf.push({ t: nowMs, landmarks });
    while (this.buf.length && nowMs - this.buf[0].t > this.tuning.bufferMs) this.buf.shift();

    const t = this.tuning;
    const letter = detect(landmarks);
    let emitted = null;

    if (this.shape > t.moveShape || this.travel > t.moveTravel) {
      this.state = 'moving';
      this.stableCount = 0;
      this.stableLetter = null;
      this.armed = true;
    } else if (this.shape < t.settleShape && this.travel < t.settleTravel && letter) {
      if (letter === this.stableLetter) this.stableCount++;
      else { this.stableLetter = letter; this.stableCount = 1; }
      if (this.stableCount >= t.settleFrames) {
        this.state = 'settled';
        if (this.armed) {
          // A motion letter wins over the shape it was drawn with — otherwise a
          // J would always report as the I it's made from.
          emitted = this.motionMatch(detect) || letter;
          this.armed = false;
        }
      }
    } else if (!letter) {
      // Still, but not a recognisable shape — mid-transition.
      this.stableCount = 0;
      this.stableLetter = null;
    }

    return { emitted, state: this.state, shape: this.shape, travel: this.travel, letter };
  }
}
