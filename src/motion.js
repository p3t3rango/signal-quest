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
  settleTravel: 0.0010,  // below this the hand counts as stationary
  moveTravel: 0.0022,    // above this it's a deliberate move (doubled letter)
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
        if (this.armed) { emitted = letter; this.armed = false; }
      }
    } else if (!letter) {
      // Still, but not a recognisable shape — mid-transition.
      this.stableCount = 0;
      this.stableLetter = null;
    }

    return { emitted, state: this.state, shape: this.shape, travel: this.travel, letter };
  }
}
