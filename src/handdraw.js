// High-fidelity ASL hand gesture drawings using canvas 2D paths
// Draws detailed hand shapes at any size with orientation labels

const SKIN_LIGHT = '#e0d0b8';
const SKIN_MID = '#c8b89a';
const SKIN_DARK = '#a08060';
const OUTLINE = '#346856';
const NAIL = '#d8c8b0';

// Helper: draw a rounded finger segment
function finger(ctx, x, y, w, h, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-w/2, -h, w, h, [w/2, w/2, 2, 2]);
  ctx.fill();
  ctx.stroke();
  // Nail
  ctx.fillStyle = NAIL;
  ctx.beginPath();
  ctx.roundRect(-w/2 + 2, -h + 1, w - 4, h * 0.25, [w/3, w/3, 0, 0]);
  ctx.fill();
  ctx.restore();
}

// Helper: draw a palm base
function palm(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

// Helper: draw a curled finger (small bump)
function curledFinger(ctx, x, y, w) {
  ctx.beginPath();
  ctx.arc(x, y, w/2, 0, Math.PI, true);
  ctx.fill();
  ctx.stroke();
}

// Helper: draw a thumb
function thumb(ctx, x, y, len, angle, w = 14) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-w/2, 0, w, len, [2, 2, w/2, w/2]);
  ctx.fill();
  ctx.stroke();
  // Nail
  ctx.fillStyle = NAIL;
  ctx.beginPath();
  ctx.ellipse(0, len - w/3, w/3, w/4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function setupCtx(ctx) {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = SKIN_MID;
}

// Draw orientation label and arrow
function drawOrientation(ctx, x, y, w, text) {
  ctx.fillStyle = '#88c070';
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w/2, y);
}

// ─── Individual letter drawing functions ─────────────────

function drawA(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm (fist)
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 10*s, 50*s, 55*s);
  // Curled fingers on top
  ctx.fillStyle = SKIN_LIGHT;
  for (let i = 0; i < 4; i++) {
    curledFinger(ctx, cx - 18*s + i * 12*s, cy - 16*s, 13*s);
  }
  // Thumb on left side, pointing up
  ctx.fillStyle = SKIN_LIGHT;
  thumb(ctx, cx - 30*s, cy + 5*s, 30*s, -Math.PI * 0.5, 13*s);
}

function drawB(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 18*s, 48*s, 40*s);
  // Four fingers up, together
  ctx.fillStyle = SKIN_LIGHT;
  const fw = 11*s, fh = 40*s;
  for (let i = 0; i < 4; i++) {
    finger(ctx, cx - 17*s + i * 11.5*s, cy - 1*s, fw, fh, 0);
  }
  // Thumb tucked across palm
  ctx.fillStyle = SKIN_DARK;
  thumb(ctx, cx - 22*s, cy + 18*s, 22*s, Math.PI * 0.45, 11*s);
}

function drawC(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Draw a C-curve with fingers together
  ctx.fillStyle = SKIN_MID;
  ctx.beginPath();
  ctx.arc(cx, cy, 32*s, -Math.PI * 0.8, Math.PI * 0.8, false);
  ctx.lineTo(cx + 12*s, cy + 28*s);
  ctx.arc(cx, cy, 18*s, Math.PI * 0.8, -Math.PI * 0.8, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fingertips at top
  ctx.fillStyle = SKIN_LIGHT;
  ctx.beginPath();
  ctx.arc(cx + 28*s * Math.cos(-0.8), cy + 32*s * Math.sin(-0.8), 6*s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Thumb at bottom
  ctx.beginPath();
  ctx.arc(cx + 28*s * Math.cos(0.8), cy + 32*s * Math.sin(0.8), 7*s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawD(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 46*s, 40*s);
  // Index finger pointing up
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 4*s, cy - 4*s, 12*s, 42*s, 0);
  // Other fingers curled
  ctx.fillStyle = SKIN_DARK;
  for (let i = 1; i < 4; i++) {
    curledFinger(ctx, cx - 4*s + i * 10*s, cy + 2*s, 11*s);
  }
  // Thumb touching curled fingers
  thumb(ctx, cx - 22*s, cy + 6*s, 20*s, Math.PI * 0.3, 11*s);
}

function drawF(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 46*s, 38*s);
  // Middle, ring, pinky up
  ctx.fillStyle = SKIN_LIGHT;
  for (let i = 0; i < 3; i++) {
    finger(ctx, cx - 2*s + i * 12*s, cy - 4*s, 11*s, 38*s, 0);
  }
  // Index + thumb form circle (OK sign)
  ctx.fillStyle = SKIN_DARK;
  ctx.beginPath();
  ctx.arc(cx - 18*s, cy + 10*s, 12*s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = SKIN_LIGHT;
  ctx.beginPath();
  ctx.arc(cx - 18*s, cy + 10*s, 11*s, 0, Math.PI * 2);
  ctx.fill();
  // Hole in circle
  ctx.fillStyle = '#081820';
  ctx.beginPath();
  ctx.arc(cx - 18*s, cy + 10*s, 5*s, 0, Math.PI * 2);
  ctx.fill();
}

function drawI(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm (fist)
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx - 4*s, cy + 14*s, 48*s, 44*s);
  // Curled fingers
  ctx.fillStyle = SKIN_DARK;
  for (let i = 0; i < 3; i++) {
    curledFinger(ctx, cx - 16*s + i * 11*s, cy - 5*s, 12*s);
  }
  // Pinky up!
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx + 18*s, cy - 6*s, 10*s, 38*s, 0.05);
  // Thumb tucked
  ctx.fillStyle = SKIN_DARK;
  thumb(ctx, cx - 26*s, cy + 10*s, 18*s, Math.PI * 0.5, 10*s);
}

function drawK(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 48*s, 40*s);
  // Index up
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 8*s, cy - 4*s, 12*s, 40*s, -0.1);
  // Middle up, slightly spread
  finger(ctx, cx + 6*s, cy - 4*s, 12*s, 40*s, 0.1);
  // Ring + pinky curled
  ctx.fillStyle = SKIN_DARK;
  curledFinger(ctx, cx + 14*s, cy + 2*s, 11*s);
  curledFinger(ctx, cx + 22*s, cy + 4*s, 10*s);
  // Thumb between index and middle
  ctx.fillStyle = SKIN_LIGHT;
  thumb(ctx, cx - 2*s, cy + 4*s, 18*s, -Math.PI * 0.5, 10*s);
}

function drawL(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx + 2*s, cy + 14*s, 44*s, 40*s);
  // Index finger pointing UP
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 8*s, cy - 6*s, 12*s, 44*s, 0);
  // Thumb pointing LEFT (making the L)
  ctx.fillStyle = SKIN_LIGHT;
  thumb(ctx, cx - 20*s, cy + 14*s, 34*s, -Math.PI * 0.5, 12*s);
  // Other fingers curled
  ctx.fillStyle = SKIN_DARK;
  for (let i = 1; i < 4; i++) {
    curledFinger(ctx, cx + i * 10*s, cy + 0*s, 11*s);
  }
}

function drawO(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Draw O shape — all fingertips touching thumb
  ctx.fillStyle = SKIN_MID;
  // Outer oval
  ctx.beginPath();
  ctx.ellipse(cx, cy, 30*s, 36*s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Inner hole
  ctx.fillStyle = '#081820';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 14*s, 18*s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wrist
  ctx.fillStyle = SKIN_MID;
  ctx.beginPath();
  ctx.roundRect(cx - 14*s, cy + 30*s, 28*s, 18*s, [0, 0, 6, 6]);
  ctx.fill();
  ctx.stroke();
}

function drawR(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 46*s, 40*s);
  // Index and middle crossed
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 4*s, cy - 6*s, 12*s, 42*s, 0.1);  // index, tilted right
  finger(ctx, cx + 4*s, cy - 6*s, 12*s, 42*s, -0.1);  // middle, tilted left (crossing)
  // X mark to show crossed
  ctx.strokeStyle = '#ebcb8b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8*s, cy - 20*s);
  ctx.lineTo(cx + 8*s, cy - 28*s);
  ctx.stroke();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  // Ring + pinky curled
  ctx.fillStyle = SKIN_DARK;
  curledFinger(ctx, cx + 14*s, cy + 2*s, 11*s);
  curledFinger(ctx, cx + 22*s, cy + 4*s, 10*s);
  // Thumb tucked
  thumb(ctx, cx - 22*s, cy + 10*s, 18*s, Math.PI * 0.4, 10*s);
}

function drawU(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 46*s, 40*s);
  // Index and middle up, together (no gap)
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 6*s, cy - 6*s, 12*s, 42*s, 0);
  finger(ctx, cx + 6*s, cy - 6*s, 12*s, 42*s, 0);
  // Ring + pinky curled
  ctx.fillStyle = SKIN_DARK;
  curledFinger(ctx, cx + 14*s, cy + 2*s, 11*s);
  curledFinger(ctx, cx + 22*s, cy + 4*s, 10*s);
  // Thumb tucked
  thumb(ctx, cx - 22*s, cy + 10*s, 18*s, Math.PI * 0.4, 10*s);
}

function drawV(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 16*s, 46*s, 40*s);
  // Index and middle up, SPREAD (V shape)
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 10*s, cy - 6*s, 12*s, 42*s, -0.15);  // index tilted left
  finger(ctx, cx + 10*s, cy - 6*s, 12*s, 42*s, 0.15);   // middle tilted right
  // Ring + pinky curled
  ctx.fillStyle = SKIN_DARK;
  curledFinger(ctx, cx + 16*s, cy + 2*s, 11*s);
  curledFinger(ctx, cx + 24*s, cy + 4*s, 10*s);
  // Thumb tucked
  thumb(ctx, cx - 22*s, cy + 10*s, 18*s, Math.PI * 0.4, 10*s);
}

function drawW(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx + 2*s, cy + 16*s, 48*s, 38*s);
  // Index, middle, ring up and spread
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx - 14*s, cy - 6*s, 11*s, 40*s, -0.12);
  finger(ctx, cx, cy - 6*s, 11*s, 40*s, 0);
  finger(ctx, cx + 14*s, cy - 6*s, 11*s, 40*s, 0.12);
  // Pinky curled
  ctx.fillStyle = SKIN_DARK;
  curledFinger(ctx, cx + 24*s, cy + 2*s, 10*s);
  // Thumb tucked
  thumb(ctx, cx - 24*s, cy + 10*s, 18*s, Math.PI * 0.4, 10*s);
}

function drawY(ctx, cx, cy, size) {
  setupCtx(ctx);
  const s = size / 100;
  // Palm (fist)
  ctx.fillStyle = SKIN_MID;
  palm(ctx, cx, cy + 12*s, 48*s, 44*s);
  // Middle three fingers curled
  ctx.fillStyle = SKIN_DARK;
  for (let i = 0; i < 3; i++) {
    curledFinger(ctx, cx - 10*s + i * 11*s, cy - 6*s, 12*s);
  }
  // Pinky up!
  ctx.fillStyle = SKIN_LIGHT;
  finger(ctx, cx + 20*s, cy - 8*s, 10*s, 38*s, 0.08);
  // Thumb out to the side!
  ctx.fillStyle = SKIN_LIGHT;
  thumb(ctx, cx - 24*s, cy + 10*s, 32*s, -Math.PI * 0.5, 12*s);
}

// Map of drawing functions
const DRAW_FUNCTIONS = {
  A: drawA, B: drawB, C: drawC, D: drawD,
  F: drawF, I: drawI, K: drawK, L: drawL,
  O: drawO, R: drawR, U: drawU, V: drawV,
  W: drawW, Y: drawY,
};

// Orientation info for each letter
const ORIENTATIONS = {
  A: 'PALM FACING YOU',
  B: 'PALM FACING OUT',
  C: 'THUMB DOWN, PALM LEFT',
  D: 'PALM FACING OUT',
  F: 'PALM FACING OUT',
  I: 'PALM FACING OUT',
  K: 'PALM FACING OUT',
  L: 'PALM FACING YOU',
  O: 'FACING CAMERA',
  R: 'PALM FACING OUT',
  U: 'PALM FACING OUT',
  V: 'PALM FACING OUT',
  W: 'PALM FACING OUT',
  Y: 'PALM FACING YOU',
};

// Which hand to use
const HAND_SIDE = {
  A: 'RIGHT HAND', B: 'RIGHT HAND', C: 'RIGHT HAND', D: 'RIGHT HAND',
  F: 'RIGHT HAND', I: 'RIGHT HAND', K: 'RIGHT HAND', L: 'RIGHT HAND',
  O: 'EITHER HAND', R: 'RIGHT HAND', U: 'RIGHT HAND', V: 'RIGHT HAND',
  W: 'RIGHT HAND', Y: 'RIGHT HAND',
};

/**
 * Draw an ASL hand sign on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} letter - ASL letter to draw
 * @param {number} cx - center x
 * @param {number} cy - center y
 * @param {number} size - drawing size (100 = default)
 */
export function drawHandSign(ctx, letter, cx, cy, size = 100) {
  const fn = DRAW_FUNCTIONS[letter];
  if (!fn) return;
  ctx.save();
  fn(ctx, cx, cy, size);
  ctx.restore();
}

export function getOrientation(letter) {
  return ORIENTATIONS[letter] || 'PALM FACING CAMERA';
}

export function getHandSide(letter) {
  return HAND_SIDE[letter] || 'RIGHT HAND';
}

/**
 * Draw ghost hand overlay during attempt phase.
 * Semi-transparent, pulsing, scaled to approximate hand size.
 */
export function drawGhostHand(ctx, letter, cx, cy, size, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawHandSign(ctx, letter, cx, cy, size);
  ctx.restore();
}
