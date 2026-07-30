// ASL Sign Detection Library
// Uses MediaPipe hand landmarks to detect ASL letters and words

// Landmark indices:
// 0: wrist
// 1-4: thumb (CMC, MCP, IP, TIP)
// 5-8: index (MCP, PIP, DIP, TIP)
// 9-12: middle (MCP, PIP, DIP, TIP)
// 13-16: ring (MCP, PIP, DIP, TIP)
// 17-20: pinky (MCP, PIP, DIP, TIP)

// ─── Finger state helpers ──────────────────────────────
// These use relative comparisons scaled to hand size for robustness

function handScale(landmarks) {
  // Distance from wrist to middle MCP as a reference unit
  const wrist = landmarks[0];
  const midMCP = landmarks[9];
  return Math.hypot(wrist.x - midMCP.x, wrist.y - midMCP.y) || 0.15;
}

function isFingerExtended(landmarks, finger) {
  const map = { index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
  const ids = map[finger];
  if (!ids) return false;
  const tip = landmarks[ids[3]];
  const pip = landmarks[ids[1]];
  const mcp = landmarks[ids[0]];
  // Tip is above PIP (lower y = higher on screen)
  // Use a small tolerance relative to hand size
  const hs = handScale(landmarks);
  return tip.y < pip.y - hs * 0.05;
}

function isFingerCurled(landmarks, finger) {
  const map = { index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
  const ids = map[finger];
  const tip = landmarks[ids[3]];
  const pip = landmarks[ids[1]];
  const hs = handScale(landmarks);
  // Tip is below or near PIP level — generous tolerance
  return tip.y > pip.y - hs * 0.08;
}

// Where the thumb tip sits along the palm's lateral axis: 0 at the index
// knuckle, 1 at the pinky knuckle.
//
// The previous test measured thumb tip to thumb MCP distance, which is close to
// the thumb's own length whichever way it points — folding a thumb across the
// palm rotates it, it doesn't shorten it. That made "tucked" depend mostly on
// camera foreshortening, so a slightly angled hand read as thumb-out and a
// correct B was rejected.
//
// This projection asks the question that actually matters: is the thumb lying
// across the palm, or held out to the side of it? Scale-, rotation- and
// handedness-invariant, because the axis comes from the landmarks themselves.
function thumbPalmPosition(landmarks) {
  const idx = landmarks[5];    // index MCP
  const pinky = landmarks[17]; // pinky MCP
  const tip = landmarks[4];
  const ax = pinky.x - idx.x, ay = pinky.y - idx.y;
  const len2 = ax * ax + ay * ay;
  if (len2 < 1e-9) return 0;
  return ((tip.x - idx.x) * ax + (tip.y - idx.y) * ay) / len2;
}

// Deliberately NOT switched to thumbPalmPosition. A, C, K, L and Y gate on this,
// and K holds the thumb between the index and middle fingers — over the palm —
// so a projection-based test would read K as tucked and break it. A and C are
// near the boundary too. Without real landmark captures to check against, the
// distance test stays; it is at least permissive, and false positives here are
// much cheaper than rejecting correct signs.
function isThumbExtended(landmarks) {
  const tip = landmarks[4];
  const mcp = landmarks[2];
  const hs = handScale(landmarks);
  const dx = Math.abs(tip.x - mcp.x);
  const dy = Math.abs(tip.y - mcp.y);
  return Math.max(dx, dy) > hs * 0.3;
}

// Folded in over the palm rather than held out to the side. Only U gates on this
// now, so the projection metric is safe to use here.
function isThumbTucked(landmarks) {
  return thumbPalmPosition(landmarks) >= 0.08;
}

// Index and pinky fingertips close enough that the hand reads as a flat blade
// rather than a splayed "5". Tip-to-tip distance, so a rotated hand still passes.
function fingersTogether(landmarks) {
  const spread = Math.hypot(landmarks[8].x - landmarks[20].x, landmarks[8].y - landmarks[20].y);
  return spread < handScale(landmarks) * 1.2;
}

function allFingersCurled(landmarks) {
  return isFingerCurled(landmarks, 'index') &&
         isFingerCurled(landmarks, 'middle') &&
         isFingerCurled(landmarks, 'ring') &&
         isFingerCurled(landmarks, 'pinky');
}

function allFingersExtended(landmarks) {
  return isFingerExtended(landmarks, 'index') &&
         isFingerExtended(landmarks, 'middle') &&
         isFingerExtended(landmarks, 'ring') &&
         isFingerExtended(landmarks, 'pinky');
}

// Count how many of the 4 fingers are curled (0-4)
function curledCount(landmarks) {
  let n = 0;
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    if (isFingerCurled(landmarks, f)) n++;
  }
  return n;
}

// ─── Confidence-based detection ────────────────────────
// Returns a confidence score 0-1 instead of boolean for better UX

function fingerScore(landmarks, finger, wantExtended) {
  const map = { index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
  const ids = map[finger];
  const tip = landmarks[ids[3]];
  const pip = landmarks[ids[1]];
  const hs = handScale(landmarks);
  const diff = (pip.y - tip.y) / hs; // positive = extended, negative = curled
  if (wantExtended) return Math.min(1, Math.max(0, diff * 2));
  return Math.min(1, Math.max(0, -diff * 2 + 0.5));
}

// ─── ASL letter detectors ──────────────────────────────
const SIGN_DETECTORS = {
  A: (lm) => {
    // Fist with thumb to the side — all 4 fingers curled, thumb out
    return curledCount(lm) >= 3 && isThumbExtended(lm);
  },
  B: (lm) => {
    // Flat hand, four fingers up and held together. Four extended fingers is
    // already unique to B across this letter set (W curls the pinky), so the
    // thumb adds no discrimination here — gating on it only rejected good Bs.
    return allFingersExtended(lm) && fingersTogether(lm);
  },
  C: (lm) => {
    // Curved hand — fingers together, slightly curved, thumb out
    const indexTip = lm[8];
    const pinkyTip = lm[20];
    const spread = Math.abs(indexTip.x - pinkyTip.x);
    const hs = handScale(lm);
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           spread < hs * 0.6 &&
           isThumbExtended(lm);
  },
  D: (lm) => {
    // Index up, others curled
    return isFingerExtended(lm, 'index') &&
           isFingerCurled(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky');
  },
  F: (lm) => {
    // Middle, ring, pinky up; index and thumb touch (circle)
    return !isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerExtended(lm, 'ring') &&
           isFingerExtended(lm, 'pinky');
  },
  I: (lm) => {
    // Pinky up, all others down
    return isFingerCurled(lm, 'index') &&
           isFingerCurled(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerExtended(lm, 'pinky');
  },
  K: (lm) => {
    // Index and middle up, spread, thumb out
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           isThumbExtended(lm);
  },
  L: (lm) => {
    // L shape: index up, thumb out, others curled
    return isFingerExtended(lm, 'index') &&
           isFingerCurled(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           isThumbExtended(lm);
  },
  O: (lm) => {
    // All fingertips touch thumb tip forming O
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const hs = handScale(lm);
    const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    return dist < hs * 0.4 && !allFingersExtended(lm);
  },
  R: (lm) => {
    // Index and middle crossed/together and up
    const indexTip = lm[8];
    const middleTip = lm[12];
    const hs = handScale(lm);
    const close = Math.abs(indexTip.x - middleTip.x) < hs * 0.15;
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           close;
  },
  U: (lm) => {
    // Index and middle up together, thumb tucked
    const indexTip = lm[8];
    const middleTip = lm[12];
    const hs = handScale(lm);
    const close = Math.abs(indexTip.x - middleTip.x) < hs * 0.3;
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           close &&
           isThumbTucked(lm);
  },
  V: (lm) => {
    // Peace sign: index and middle up, spread
    const indexTip = lm[8];
    const middleTip = lm[12];
    const hs = handScale(lm);
    const spread = Math.abs(indexTip.x - middleTip.x);
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           spread > hs * 0.15;
  },
  W: (lm) => {
    // Index, middle, ring up spread
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerExtended(lm, 'ring') &&
           isFingerCurled(lm, 'pinky');
  },
  Y: (lm) => {
    // Thumb and pinky out, rest curled (hang loose)
    return isThumbExtended(lm) &&
           isFingerCurled(lm, 'index') &&
           isFingerCurled(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerExtended(lm, 'pinky');
  },
};

export function detectSign(landmarks, targetLetter) {
  const detector = SIGN_DETECTORS[targetLetter];
  if (!detector) return false;
  return detector(landmarks);
}

export function getDetectableLetters() {
  return Object.keys(SIGN_DETECTORS);
}

// ─── Debug info for visual feedback ────────────────────
// Returns a diagnostic object showing what the detector sees
export function getHandDebugInfo(landmarks) {
  if (!landmarks) return null;
  const hs = handScale(landmarks);
  return {
    fingers: {
      index: isFingerExtended(landmarks, 'index') ? 'UP' : 'DOWN',
      middle: isFingerExtended(landmarks, 'middle') ? 'UP' : 'DOWN',
      ring: isFingerExtended(landmarks, 'ring') ? 'UP' : 'DOWN',
      pinky: isFingerExtended(landmarks, 'pinky') ? 'UP' : 'DOWN',
    },
    thumb: isThumbExtended(landmarks) ? 'OUT' : 'IN',
    handScale: hs.toFixed(3),
    // Which signs currently match
    matches: Object.keys(SIGN_DETECTORS).filter(letter => SIGN_DETECTORS[letter](landmarks)),
  };
}

// ─── Per-finger feedback for coaching ────────────────────
// Returns array of hint objects telling user what to fix
const SIGN_EXPECTATIONS = {
  A: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled', thumb: 'extended' },
  // thumb 'any': the detector no longer gates on it, and a hint demanding a
  // tuck while the sign is already accepted just reads as broken. The written
  // description still teaches the thumb position.
  B: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended', thumb: 'any', together: true },
  C: { index: 'extended', middle: 'extended', ring: 'any', pinky: 'any', thumb: 'extended' },
  D: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled', thumb: 'any' },
  F: { index: 'curled', middle: 'extended', ring: 'extended', pinky: 'extended', thumb: 'any' },
  I: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'extended', thumb: 'any' },
  K: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled', thumb: 'extended' },
  L: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled', thumb: 'extended' },
  O: { index: 'any', middle: 'any', ring: 'any', pinky: 'any', thumb: 'any' },
  R: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled', thumb: 'any' },
  U: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled', thumb: 'tucked' },
  V: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled', thumb: 'any' },
  W: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'curled', thumb: 'any' },
  Y: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'extended', thumb: 'extended' },
};

const FINGER_NAMES = { index: 'INDEX', middle: 'MIDDLE', ring: 'RING', pinky: 'PINKY' };

export function getSignFeedback(landmarks, targetLetter) {
  if (!landmarks) return [];
  const expect = SIGN_EXPECTATIONS[targetLetter];
  if (!expect) return [];

  const hints = [];
  for (const finger of ['index', 'middle', 'ring', 'pinky']) {
    if (expect[finger] === 'extended' && !isFingerExtended(landmarks, finger)) {
      hints.push(`RAISE ${FINGER_NAMES[finger]}`);
    } else if (expect[finger] === 'curled' && !isFingerCurled(landmarks, finger)) {
      hints.push(`CURL ${FINGER_NAMES[finger]}`);
    }
  }
  if (expect.thumb === 'extended' && !isThumbExtended(landmarks)) {
    hints.push('EXTEND THUMB');
  } else if (expect.thumb === 'tucked' && !isThumbTucked(landmarks)) {
    hints.push('TUCK THUMB IN');
  }
  // Without this, a splayed B fails detection while every finger reads
  // "extended" — so the coaching panel would sit empty with nothing to fix.
  if (expect.together && !fingersTogether(landmarks)) {
    hints.push('FINGERS TOGETHER');
  }
  return hints;
}

export const SIGN_DESCRIPTIONS = {
  A: "Make a fist with\nyour thumb on\nthe side",
  B: "All four fingers\nup straight,\nthumb tucked in",
  C: "Curve your hand\nlike holding a\nball (C shape)",
  D: "Index finger up,\nothers curled\ninto thumb",
  F: "Middle, ring &\npinky up. Index\n& thumb circle",
  I: "Only your pinky\nfinger up,\nrest in fist",
  K: "Index & middle\nup with thumb\nbetween them",
  L: "Index finger up\nand thumb out\n(L shape)",
  O: "All fingertips\ntouch thumb\nmaking an O",
  R: "Cross your index\nand middle\nfingers",
  U: "Index & middle\nfingers up\ntogether",
  V: "Peace sign!\nIndex & middle\nfingers spread",
  W: "Index, middle &\nring fingers\nup and spread",
  Y: "Thumb & pinky\nout, rest curled\n(hang loose!)",
};

export const ZONES = [
  { id: 'alpha_cliffs', name: 'Alpha Cliffs', description: 'Learn to fingerspell!', badge: 'Quartz Digit', badgeColor: '#88c0d0', letters: ['A', 'B', 'L'], unlocked: true },
  { id: 'signal_shores', name: 'Signal Shores', description: 'More letters await!', badge: 'Coral Signal', badgeColor: '#ebcb8b', letters: ['D', 'I', 'V'], unlocked: false },
  { id: 'gesture_grove', name: 'Gesture Grove', description: 'Complex hand shapes!', badge: 'Emerald Palm', badgeColor: '#a3be8c', letters: ['W', 'Y', 'K'], unlocked: false },
  { id: 'summit', name: "Sentinel's Summit", description: 'Master all signs!', badge: 'Master Link', badgeColor: '#b48ead', letters: ['C', 'F', 'O', 'R', 'U'], unlocked: false },
];
