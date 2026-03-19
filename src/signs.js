// ASL Sign Detection Library
// Uses MediaPipe hand landmarks to detect ASL letters and words

// Landmark indices:
// 0: wrist
// 1-4: thumb (CMC, MCP, IP, TIP)
// 5-8: index (MCP, PIP, DIP, TIP)
// 9-12: middle (MCP, PIP, DIP, TIP)
// 13-16: ring (MCP, PIP, DIP, TIP)
// 17-20: pinky (MCP, PIP, DIP, TIP)

function isFingerExtended(landmarks, finger) {
  // finger: 'index' | 'middle' | 'ring' | 'pinky'
  const map = { index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
  const ids = map[finger];
  if (!ids) return false;
  const tip = landmarks[ids[3]];
  const dip = landmarks[ids[2]];
  const pip = landmarks[ids[1]];
  // Tip is above (lower y) the PIP joint
  return tip.y < pip.y - 0.02;
}

function isThumbExtended(landmarks) {
  // Thumb tip is significantly to the side of the thumb IP
  const tip = landmarks[4];
  const ip = landmarks[3];
  const mcp = landmarks[2];
  // Check horizontal distance
  return Math.abs(tip.x - mcp.x) > 0.06;
}

function isThumbUp(landmarks) {
  const tip = landmarks[4];
  const mcp = landmarks[2];
  return tip.y < mcp.y - 0.05;
}

function isFingerCurled(landmarks, finger) {
  const map = { index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
  const ids = map[finger];
  const tip = landmarks[ids[3]];
  const pip = landmarks[ids[1]];
  return tip.y > pip.y;
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

// ASL letter detectors
const SIGN_DETECTORS = {
  A: (lm) => {
    // Fist with thumb to the side
    return allFingersCurled(lm) && isThumbExtended(lm);
  },
  B: (lm) => {
    // All fingers up, thumb tucked
    return allFingersExtended(lm) && !isThumbExtended(lm);
  },
  C: (lm) => {
    // Curved hand - fingers together, slightly curved
    const indexTip = lm[8];
    const pinkyTip = lm[20];
    const thumbTip = lm[4];
    // All fingers somewhat extended, thumb out, forming a C curve
    const spread = Math.abs(indexTip.x - pinkyTip.x);
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           spread < 0.12 &&
           isThumbExtended(lm);
  },
  D: (lm) => {
    // Index up, other fingers curled touching thumb
    return isFingerExtended(lm, 'index') &&
           isFingerCurled(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky');
  },
  F: (lm) => {
    // Middle, ring, pinky up; index and thumb make circle
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
    // Index and middle up, spread apart
    const indexTip = lm[8];
    const middleTip = lm[12];
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
    const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    return dist < 0.06 && !allFingersExtended(lm);
  },
  R: (lm) => {
    // Index and middle crossed/together and up
    const indexTip = lm[8];
    const middleTip = lm[12];
    const close = Math.abs(indexTip.x - middleTip.x) < 0.03;
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           close;
  },
  U: (lm) => {
    // Index and middle up together
    const indexTip = lm[8];
    const middleTip = lm[12];
    const close = Math.abs(indexTip.x - middleTip.x) < 0.06;
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           close &&
           !isThumbExtended(lm);
  },
  V: (lm) => {
    // Peace sign: index and middle up, spread
    const indexTip = lm[8];
    const middleTip = lm[12];
    const spread = Math.abs(indexTip.x - middleTip.x);
    return isFingerExtended(lm, 'index') &&
           isFingerExtended(lm, 'middle') &&
           isFingerCurled(lm, 'ring') &&
           isFingerCurled(lm, 'pinky') &&
           spread > 0.04;
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

// Pixel art representations of hand signs for the ghost hand guide
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

// Curriculum zones
export const ZONES = [
  {
    id: 'alpha_cliffs',
    name: 'Alpha Cliffs',
    description: 'Learn to fingerspell!',
    badge: 'Quartz Digit',
    badgeColor: '#88c0d0',
    letters: ['A', 'B', 'L'],
    unlocked: true,
  },
  {
    id: 'signal_shores',
    name: 'Signal Shores',
    description: 'More letters await!',
    badge: 'Coral Signal',
    badgeColor: '#ebcb8b',
    letters: ['D', 'I', 'V'],
    unlocked: false,
  },
  {
    id: 'gesture_grove',
    name: 'Gesture Grove',
    description: 'Complex hand shapes!',
    badge: 'Emerald Palm',
    badgeColor: '#a3be8c',
    letters: ['W', 'Y', 'K'],
    unlocked: false,
  },
  {
    id: 'summit',
    name: "Sentinel's Summit",
    description: 'Master all signs!',
    badge: 'Master Link',
    badgeColor: '#b48ead',
    letters: ['C', 'F', 'O', 'R', 'U'],
    unlocked: false,
  },
];
