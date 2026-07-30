// Signal Quest: Color Edition — Mobile-first Duolingo-style ASL trainer
import { Renderer } from './renderer.js';
import { SFX, playBGM, toggleMute, isMuted } from './audio.js';
import { detectSign, SIGN_DESCRIPTIONS, getHandDebugInfo, getSignFeedback } from './signs.js';
import { getOrientation, getHandSide, drawHandSign } from './handdraw.js';
import * as State from './gamestate.js';

// ─── Setup ─────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const R = new Renderer(canvas);
const videoEl = document.getElementById('webcam-video');
const processCanvas = document.getElementById('webcam-process');

// ─── Preload ASL reference SVGs ────────────────────────
const signImages = {};
const SIGN_LETTERS = ['A','B','C','D','F','I','K','L','O','R','U','V','W','Y'];
SIGN_LETTERS.forEach(letter => {
  const img = new Image();
  img.src = `/signs/${letter}.svg`;
  signImages[letter] = img;
});

// Largest rect with the source's aspect ratio that fits in the box, centred.
function fitContain(srcW, srcH, x, y, w, h) {
  const scale = Math.min(w / srcW, h / srcH);
  const fw = srcW * scale, fh = srcH * scale;
  return { x: x + (w - fw) / 2, y: y + (h - fh) / 2, w: fw, h: fh };
}

// Draw a sign reference. Prefers the SVG photo-trace, but several of the shipped
// SVGs are actually saved error pages that fail to decode — so fall back to the
// procedural hand in handdraw.js rather than leaving an empty box.
function drawSign(letter, x, y, w, h, { flipped = true, alpha = 1 } = {}) {
  const img = signImages[letter];
  // The source traces aren't square — most are roughly 1:2 portrait and Y is
  // landscape — so fit them inside the box instead of stretching to fill it.
  const box = Renderer.usable(img) ? fitContain(img.naturalWidth, img.naturalHeight, x, y, w, h) : null;
  const drew = box && (alpha < 1
    ? (flipped ? R.drawImageFlippedAlpha(img, box.x, box.y, box.w, box.h, alpha) : R.drawImageAlpha(img, box.x, box.y, box.w, box.h, alpha))
    : (flipped ? R.drawImageFlipped(img, box.x, box.y, box.w, box.h) : R.drawImage(img, box.x, box.y, box.w, box.h)));
  if (drew) return;

  R.ctx.save();
  R.ctx.globalAlpha = alpha;
  // handdraw draws around a centre point, in device pixels
  R.ctx.translate(R.px(x + w / 2), R.px(y + h / 2));
  if (flipped) R.ctx.scale(-1, 1);
  drawHandSign(R.ctx, letter, 0, 0, R.px(Math.min(w, h)));
  R.ctx.restore();
}

// ─── Input System ──────────────────────────────────────
let tapX = -1, tapY = -1, tapped = false;
let dragStartY = -1, dragDelta = 0, isDragging = false;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  const p = R.screenToLogical(t.clientX, t.clientY);
  tapX = p.x; tapY = p.y; tapped = true;
  dragStartY = t.clientY; isDragging = false; dragDelta = 0;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (dragStartY >= 0) {
    const dy = e.touches[0].clientY - dragStartY;
    if (Math.abs(dy) > 8) { isDragging = true; dragDelta = dy; }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (isDragging) { tapped = false; } // was a drag, not a tap
  dragStartY = -1; isDragging = false;
}, { passive: false });

canvas.addEventListener('click', e => {
  const p = R.screenToLogical(e.clientX, e.clientY);
  tapX = p.x; tapY = p.y; tapped = true;
});

// Keyboard fallback (desktop)
const keys = {};
document.addEventListener('keydown', e => { keys[e.key] = true; e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key] = false; });

function consumeTap() {
  if (tapped) { tapped = false; return { x: tapX, y: tapY }; }
  return null;
}

// ─── Button System ─────────────────────────────────────
let buttons = [];

function btn(id, x, y, w, h, label, style = 'primary') {
  buttons.push({ id, x, y, w, h, label, style });
}

function clearButtons() { buttons = []; }

function drawButtons() {
  buttons.forEach(b => {
    if (b.style === 'primary') {
      R.rectColor(b.x, b.y, b.w, b.h, '#346856');
      R.rectColor(b.x + 1, b.y + 1, b.w - 2, b.h - 2, '#1a3a2a');
      R.textColor(b.label, b.x + b.w / 2, b.y + Math.floor((b.h - 8) / 2), '#e0f8d0', 8, 'center');
    } else if (b.style === 'secondary') {
      R.rectColor(b.x, b.y, b.w, b.h, '#222');
      R.textColor(b.label, b.x + b.w / 2, b.y + Math.floor((b.h - 7) / 2), '#88c070', 7, 'center');
    } else if (b.style === 'small') {
      R.textColor(b.label, b.x + b.w / 2, b.y + 2, '#88c070', 6, 'center');
    }
  });
}

function hitButton(tx, ty) {
  return buttons.find(b => tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h);
}

// ─── Webcam / MediaPipe ────────────────────────────────
let currentLandmarks = null;
let handDetected = false;
let webcamReady = false;

function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn('[SignalQuest] getUserMedia unavailable — camera features disabled');
    return;
  }
  if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
    console.warn('[SignalQuest] MediaPipe scripts did not load — hand detection disabled');
    return;
  }
  initHands();
}

function initHands() {
  const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
  hands.onResults(results => {
    if (results.multiHandLandmarks?.length > 0) {
      currentLandmarks = results.multiHandLandmarks[0];
      handDetected = true;
    } else {
      currentLandmarks = null;
      handDetected = false;
    }
  });
  // camera_utils' Camera acquires the webcam itself and drives onFrame from
  // requestAnimationFrame. Don't call getUserMedia separately — a second
  // acquisition leaks the first stream and keeps the device held open.
  const cam = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }); },
    width: 320, height: 240,
  });
  Promise.resolve(cam.start())
    .then(() => { webcamReady = true; })
    .catch(e => console.error('[SignalQuest] camera start failed', e));
}

// ─── Scene System ──────────────────────────────────────
let scene = 'home';
let sceneTimer = 0;
let transitionPhase = 'none'; // 'none' | 'closing' | 'opening'
let transitionTimer = 0;
let transitionTarget = null;
let transitionData = {};
const TRANSITION_SPEED = 600; // ms for full close or open

function goTo(name, data = {}) {
  if (transitionPhase !== 'none') return;
  transitionTarget = name;
  transitionData = data;
  transitionTimer = 0;
  transitionPhase = 'closing';
}

function finishTransition() {
  scene = transitionTarget;
  sceneTimer = 0;
  clearButtons();
  transitionTarget = null;
  const init = sceneInits[scene];
  if (init) init(transitionData);
  transitionPhase = 'opening';
  transitionTimer = 0;
}

// ─── Scene: Home ───────────────────────────────────────
function initHome() {
  playBGM('lofi');
}

function updateHome(dt) {
  sceneTimer += dt;
  clearButtons();
  // A cleared lesson whose checkpoint is still outstanding blocks the next
  // lesson, so CONTINUE has to lead there rather than into a locked door.
  const pendingCheckpoint = State.getPendingCheckpointId();
  const nextId = State.getNextLessonId();
  if (pendingCheckpoint || nextId) {
    btn('continue', 30, 170, 100, 22, pendingCheckpoint ? 'REVIEW' : 'CONTINUE', 'primary');
  }
  btn('lessons', 30, 200, 100, 18, 'LESSONS', 'secondary');
  btn('profile', 30, 226, 100, 18, 'PROFILE', 'secondary');

  const go = () => {
    SFX.select();
    if (pendingCheckpoint) goTo('quiz', { lessonId: pendingCheckpoint });
    else goTo('lesson', { lessonId: nextId });
  };

  const tap = consumeTap();
  if (tap) {
    const b = hitButton(tap.x, tap.y);
    if (b?.id === 'continue' && (pendingCheckpoint || nextId)) go();
    else if (b?.id === 'lessons') { SFX.select(); goTo('map'); }
    else if (b?.id === 'profile') { SFX.select(); goTo('profile'); }
  }
  // Keyboard shortcuts
  if (keys['Enter'] || keys['z']) { keys['Enter'] = false; keys['z'] = false;
    if (pendingCheckpoint || nextId) go();
  }
}

function drawHome() {
  R.clear(0);

  // Title
  const bounce = Math.sin(sceneTimer / 600) * 2;
  R.textColor('SIGNAL', R.width / 2, 30 + bounce, '#88c070', 14, 'center');
  R.textColor('QUEST', R.width / 2, 50 + bounce, '#e0f8d0', 14, 'center');
  R.textColor('COLOR EDITION', R.width / 2, 72, '#e05050', 6, 'center');

  // ASL hand icon
  const img = signImages['A'];
  drawSign('A', 60, 88, 40, 40, { flipped: false });

  // Streak
  const st = State.getState();
  R.flame(20, 139, 1, Math.sin(sceneTimer / 120) > 0 ? 0 : 1);
  R.textColor(`${st.streak}`, 38, 141, '#e8c170', 10);
  R.textColor('STREAK', 58, 143, '#88c070', 5);

  // XP
  R.textColor(`XP: ${st.xp}`, R.width - 10, 143, '#88c070', 6, 'right');

  // Buttons
  drawButtons();

  // Hearts at bottom
  R.hearts(10, R.height - 20, st.hearts, st.maxHearts);

  // Signs mastered count
  R.textColor(`${State.getTotalSigns()}/14 SIGNS`, R.width / 2, R.height - 18, '#555', 5, 'center');

  // Version
  R.textColor('v2.0', R.width / 2, R.height - 8, '#222', 5, 'center');
}

// ─── Scene: Map ────────────────────────────────────────
let mapScroll = 0;
const MAP_NODE_SPACING = 50;

function initMap() {
  playBGM('lofi');
  // Scroll to show current lesson
  const nextId = State.getNextLessonId();
  const idx = nextId ? nextId - 1 : State.LESSONS.length - 1;
  mapScroll = Math.max(0, idx * MAP_NODE_SPACING - R.height / 2);
}

function updateMap(dt) {
  sceneTimer += dt;
  clearButtons();
  btn('back', 4, 4, 40, 14, '< BACK', 'small');

  // Scroll with drag
  if (isDragging) {
    mapScroll -= dragDelta * 0.3;
    dragDelta = 0;
  }
  const maxScroll = Math.max(0, State.LESSONS.length * MAP_NODE_SPACING - R.height + 80);
  mapScroll = Math.max(0, Math.min(maxScroll, mapScroll));

  const tap = consumeTap();
  if (tap) {
    const b = hitButton(tap.x, tap.y);
    if (b?.id === 'back') { SFX.select(); goTo('home'); return; }

    // Check if tap hit a lesson node
    State.LESSONS.forEach((lesson, i) => {
      const ny = R.height - 60 - i * MAP_NODE_SPACING + mapScroll;
      const nx = R.width / 2 + (i % 2 === 0 ? -20 : 20);
      const dist = Math.hypot(tap.x - nx, tap.y - ny);
      if (dist < 16 && State.isLessonUnlocked(lesson.id)) {
        SFX.select();
        goTo('lesson', { lessonId: lesson.id });
      }
    });
  }

  if (keys['x'] || keys['Escape']) { keys['x'] = false; keys['Escape'] = false; SFX.select(); goTo('home'); }
}

function drawMap() {
  R.clear(0);
  R.rect(0, 0, R.width, 20, 1);
  R.textColor('LESSONS', R.width / 2, 5, '#e0f8d0', 8, 'center');
  drawButtons();

  // Draw path and nodes
  const lessons = State.LESSONS;
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const ny = R.height - 60 - i * MAP_NODE_SPACING + mapScroll;
    const nx = R.width / 2 + (i % 2 === 0 ? -20 : 20);

    if (ny < 15 || ny > R.height + 10) continue; // off screen

    // Draw connecting line to next node
    if (i < lessons.length - 1) {
      const nextNy = R.height - 60 - (i + 1) * MAP_NODE_SPACING + mapScroll;
      const nextNx = R.width / 2 + ((i + 1) % 2 === 0 ? -20 : 20);
      R.ctx.strokeStyle = '#346856';
      R.ctx.lineWidth = R.scale * 2;
      R.ctx.setLineDash([R.scale * 3, R.scale * 3]);
      R.ctx.beginPath();
      R.ctx.moveTo(R.px(nx), R.px(ny));
      R.ctx.lineTo(R.px(nextNx), R.px(nextNy));
      R.ctx.stroke();
      R.ctx.setLineDash([]);
    }

    const unlocked = State.isLessonUnlocked(lesson.id);
    const complete = State.isLessonComplete(lesson.id);
    const isCurrent = State.getNextLessonId() === lesson.id;

    // Node circle
    if (complete) {
      R.circleColor(nx, ny, 12, '#346856');
      R.circleColor(nx, ny, 10, '#88c070');
      R.textColor('\u2713', nx, ny - 5, '#081820', 8, 'center');
      // Stars
      const stars = State.getState().bestStars[lesson.id] || 0;
      for (let s = 0; s < 3; s++) {
        R.textColor(s < stars ? '\u2605' : '\u2606', nx - 10 + s * 10, ny + 10, s < stars ? '#ebcb8b' : '#444', 5, 'center');
      }
    } else if (isCurrent) {
      // Pulsing current node
      const pulse = 1 + Math.sin(sceneTimer / 300) * 0.15;
      const r = 12 * pulse;
      R.circleColor(nx, ny, r + 2, '#ebcb8b');
      R.circleColor(nx, ny, r, '#346856');
      R.textColor(`${lesson.id}`, nx, ny - 5, '#e0f8d0', 8, 'center');
    } else if (unlocked) {
      R.circleColor(nx, ny, 12, '#222');
      R.circleColor(nx, ny, 10, '#1a3a2a');
      R.textColor(`${lesson.id}`, nx, ny - 5, '#88c070', 8, 'center');
    } else {
      R.circleColor(nx, ny, 12, '#1a1a1a');
      R.circleColor(nx, ny, 10, '#111');
      R.textColor('X', nx, ny - 5, '#333', 8, 'center');
    }

    // Lesson name
    R.textColor(lesson.name, nx + (i % 2 === 0 ? 18 : -18), ny - 8, unlocked ? '#e0f8d0' : '#333', 6, i % 2 === 0 ? 'left' : 'right');
    R.textColor(lesson.subtitle, nx + (i % 2 === 0 ? 18 : -18), ny + 2, unlocked ? '#88c070' : '#222', 5, i % 2 === 0 ? 'left' : 'right');
  }
}

// ─── Scene: Lesson ─────────────────────────────────────
let lessonData = null;       // current lesson object
let lessonSignIndex = 0;     // which sign in the lesson (0..N-1)
let lessonPhase = 'intro';   // 'intro' | 'demo' | 'attempt' | 'correct' | 'wrong'
let lessonTimer = 0;
let holdTimer = 0;
let heartsAtStart = 3;
const HOLD_REQUIRED = 1200;  // ms to hold sign (reduced for better feel)
const ATTEMPT_TIMEOUT = 20000; // ms to complete sign (more time to learn)
let detectionBuffer = [];
const SMOOTH_FRAMES = 5;

function initLesson(data) {
  // Sparser, darker track — practice needs the attention, not the music
  playBGM('lofiFocus');
  lessonData = State.getLesson(data.lessonId);
  lessonSignIndex = 0;
  lessonPhase = 'intro';
  lessonTimer = 0;
  holdTimer = 0;
  State.restoreHearts();
  heartsAtStart = State.getState().hearts;
}

function currentSign() {
  return lessonData?.signs[lessonSignIndex];
}

function updateLesson(dt) {
  sceneTimer += dt;
  lessonTimer += dt;
  clearButtons();

  switch (lessonPhase) {
    case 'intro': {
      btn('begin', 40, 210, 80, 22, 'BEGIN', 'primary');
      btn('back', 4, 4, 40, 14, '< BACK', 'small');
      const tap = consumeTap();
      if (tap) {
        const b = hitButton(tap.x, tap.y);
        if (b?.id === 'begin') { SFX.select(); lessonPhase = 'demo'; lessonTimer = 0; }
        if (b?.id === 'back') { SFX.select(); goTo('home'); }
      }
      if (keys['z'] || keys['Enter']) { keys['z'] = false; keys['Enter'] = false; SFX.select(); lessonPhase = 'demo'; lessonTimer = 0; }
      if (keys['x']) { keys['x'] = false; SFX.select(); goTo('home'); }
      break;
    }

    case 'demo': {
      if (lessonTimer > 1200) {
        btn('ready', 40, 250, 80, 22, 'READY!', 'primary');
      }
      const tap = consumeTap();
      if (tap && lessonTimer > 1200) {
        const b = hitButton(tap.x, tap.y);
        if (b?.id === 'ready') { SFX.select(); lessonPhase = 'attempt'; lessonTimer = 0; holdTimer = 0; detectionBuffer = []; }
      }
      if ((keys['z'] || keys['Enter']) && lessonTimer > 1200) {
        keys['z'] = false; keys['Enter'] = false;
        SFX.select(); lessonPhase = 'attempt'; lessonTimer = 0; holdTimer = 0; detectionBuffer = [];
      }
      break;
    }

    case 'attempt': {
      // Detection with frame smoothing
      const letter = currentSign();
      const rawDetected = handDetected && currentLandmarks && detectSign(currentLandmarks, letter);
      detectionBuffer.push(rawDetected);
      if (detectionBuffer.length > SMOOTH_FRAMES) detectionBuffer.shift();
      const smoothDetected = detectionBuffer.filter(Boolean).length >= 3; // 3 of 5 frames

      if (smoothDetected) {
        holdTimer += dt;
        if (holdTimer % 200 < dt) SFX.tick();
        if (holdTimer >= HOLD_REQUIRED) {
          // Success!
          SFX.success();
          R.flash('#88c070', 200);
          State.masterSign(letter);
          lessonPhase = 'correct';
          lessonTimer = 0;
        }
      } else {
        holdTimer = Math.max(0, holdTimer - dt * 0.3); // slower decay
      }

      // Timeout
      if (lessonTimer > ATTEMPT_TIMEOUT) {
        SFX.wrong();
        R.shake(4, 300);
        R.flash('#e05050', 150);
        const remaining = State.loseHeart();
        if (remaining <= 0) {
          lessonPhase = 'wrong';
          lessonTimer = 0;
        } else {
          lessonPhase = 'wrong';
          lessonTimer = 0;
        }
      }
      break;
    }

    case 'correct': {
      if (lessonTimer > 2000) {
        btn('next', 40, 200, 80, 22, 'NEXT \u2192', 'primary');
      }
      const tap = consumeTap();
      if (tap && lessonTimer > 2000) {
        const b = hitButton(tap.x, tap.y);
        if (b?.id === 'next') advanceSign();
      }
      if ((keys['z'] || keys['Enter']) && lessonTimer > 2000) {
        keys['z'] = false; keys['Enter'] = false;
        advanceSign();
      }
      break;
    }

    case 'wrong': {
      if (lessonTimer > 1500) {
        if (!State.hasHearts()) {
          btn('retry', 40, 210, 80, 22, 'RETRY', 'primary');
          btn('quit', 40, 240, 80, 18, 'QUIT', 'secondary');
        } else {
          btn('tryagain', 40, 210, 80, 22, 'TRY AGAIN', 'primary');
        }
      }
      const tap = consumeTap();
      if (tap && lessonTimer > 1500) {
        const b = hitButton(tap.x, tap.y);
        if (b?.id === 'retry') { SFX.select(); initLesson({ lessonId: lessonData.id }); }
        if (b?.id === 'quit') { SFX.select(); goTo('home'); }
        if (b?.id === 'tryagain') { SFX.select(); lessonPhase = 'demo'; lessonTimer = 0; }
      }
      if (keys['z'] || keys['Enter']) { keys['z'] = false; keys['Enter'] = false;
        if (!State.hasHearts()) { SFX.select(); initLesson({ lessonId: lessonData.id }); }
        else { SFX.select(); lessonPhase = 'demo'; lessonTimer = 0; }
      }
      break;
    }
  }
}

function advanceSign() {
  SFX.select();
  lessonSignIndex++;
  if (lessonSignIndex >= lessonData.signs.length) {
    // Lesson complete!
    const st = State.getState();
    const stars = st.hearts >= 3 ? 3 : st.hearts >= 2 ? 2 : 1;
    State.completeLesson(lessonData.id, stars);
    State.addXP(lessonData.xp);
    State.updateStreak();
    goTo('complete', { lessonId: lessonData.id, stars, xp: lessonData.xp });
  } else {
    lessonPhase = 'demo';
    lessonTimer = 0;
    holdTimer = 0;
  }
}

function drawLesson() {
  R.clear(0);

  // Top bar: progress dots + hearts
  R.rect(0, 0, R.width, 18, 1);
  const st = State.getState();
  R.hearts(R.width - 42, 4, st.hearts, st.maxHearts);

  // Progress dots
  if (lessonData) {
    const dotW = 6, gap = 3;
    const totalW = lessonData.signs.length * (dotW + gap) - gap;
    const startX = 8;
    for (let i = 0; i < lessonData.signs.length; i++) {
      const dx = startX + i * (dotW + gap);
      if (i < lessonSignIndex) {
        R.rectColor(dx, 7, dotW, 4, '#88c070'); // done
      } else if (i === lessonSignIndex) {
        R.rectColor(dx, 7, dotW, 4, '#ebcb8b'); // current
      } else {
        R.rectColor(dx, 7, dotW, 4, '#333'); // pending
      }
    }
  }

  switch (lessonPhase) {
    case 'intro': {
      drawButtons();
      R.textColor(lessonData.name, R.width / 2, 40, '#e0f8d0', 10, 'center');
      R.textColor(lessonData.subtitle, R.width / 2, 58, '#88c070', 6, 'center');

      R.rect(20, 80, R.width - 40, 2, 1);

      R.textColor('SIGNS TO LEARN:', R.width / 2, 92, '#88c070', 6, 'center');

      // Show sign letters with small SVG previews
      const signs = lessonData.signs;
      const spacing = Math.min(40, (R.width - 40) / signs.length);
      const startX = R.width / 2 - (signs.length * spacing) / 2;
      signs.forEach((letter, i) => {
        const lx = startX + i * spacing + spacing / 2;
        R.rectColor(lx - 14, 110, 28, 34, '#1a3a2a');
        const img = signImages[letter];
        drawSign(letter, lx - 12, 112, 24, 24);
        R.textColor(letter, lx, 140, '#e0f8d0', 7, 'center');
      });

      R.textColor(`${signs.length} signs`, R.width / 2, 165, '#555', 6, 'center');
      R.textColor(`+${lessonData.xp} XP`, R.width / 2, 180, '#ebcb8b', 6, 'center');
      break;
    }

    case 'demo': {
      const letter = currentSign();
      R.textColor(`SIGN '${letter}'`, R.width / 2, 28, '#e0f8d0', 10, 'center');

      // Large SVG reference image — flipped to match mirror/camera view
      const img = signImages[letter];
      const imgSize = 100;
      const imgX = (R.width - imgSize) / 2;
      const imgY = 50;
      R.rectColor(imgX - 3, imgY - 3, imgSize + 6, imgSize + 6, '#e0f8d0');
      R.strokeRect(imgX - 3, imgY - 3, imgSize + 6, imgSize + 6, 1);
      drawSign(letter, imgX, imgY, imgSize, imgSize);

      // Orientation
      R.textColor(getHandSide(letter), R.width / 2, 158, '#ebcb8b', 5, 'center');
      R.textColor('MIRROR VIEW', R.width / 2, 168, '#555', 5, 'center');

      // Description (typewriter)
      const desc = SIGN_DESCRIPTIONS[letter] || '';
      const charCount = Math.min(desc.length, Math.floor(lessonTimer / 30));
      R.textColor(desc.substring(0, charCount), 14, 185, '#88c070', 6);

      drawButtons();
      break;
    }

    case 'attempt': {
      const letter = currentSign();

      // Camera feed area
      const camX = 10, camY = 24, camW = R.width - 20, camH = 130;
      R.rectColor(camX, camY, camW, camH, '#111');
      R.strokeRect(camX, camY, camW, camH, 2);

      // Draw webcam feed — MIRRORED for natural selfie view
      if (webcamReady && videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
        R.drawMirrored(videoEl, camX, camY, camW, camH);
        // Draw hand landmarks mirrored to match
        if (currentLandmarks) {
          const mirrored = currentLandmarks.map(lm => ({ ...lm, x: 1 - lm.x }));
          R.drawHandLandmarks(mirrored, camX, camY, camW, camH, '#88c070');
        }
      } else {
        R.textColor('CAMERA', R.width / 2, camY + 50, '#333', 8, 'center');
        R.textColor('LOADING...', R.width / 2, camY + 65, '#333', 6, 'center');
      }

      // Ghost hand overlay — flipped to match mirrored camera
      const ghostAlpha = 0.2 + Math.sin(sceneTimer / 400) * 0.08;
      drawSign(letter, camX + camW / 2 - 35, camY + 10, 70, 70, { alpha: ghostAlpha });

      // Status text
      R.rectColor(0, 160, R.width, 16, '#081820');
      if (!handDetected) {
        R.textColor('SHOW YOUR HAND!', R.width / 2, 162, '#e05050', 8, 'center');
      } else if (holdTimer > 0) {
        R.textColor('HOLD IT...', R.width / 2, 162, '#ebcb8b', 8, 'center');
      } else {
        R.textColor(`SIGN '${letter}' NOW!`, R.width / 2, 162, '#e0f8d0', 8, 'center');
      }

      // Hold progress bar
      const holdProg = holdTimer / HOLD_REQUIRED;
      R.textColor('HOLD', 10, 182, '#555', 5);
      R.progressBarColor(34, 182, R.width - 44, 8, holdProg, '#1a1a1a', holdProg > 0.8 ? '#88c070' : '#346856');

      // Time remaining bar
      const timeProg = 1 - lessonTimer / ATTEMPT_TIMEOUT;
      R.textColor('TIME', 10, 196, '#555', 5);
      R.progressBarColor(34, 196, R.width - 44, 8, timeProg, '#1a1a1a', timeProg > 0.3 ? '#346856' : '#e05050');

      // Sign reference thumbnail — flipped to match mirror
      R.rectColor(R.width - 42, 212, 36, 36, '#1a3a2a');
      drawSign(letter, R.width - 40, 214, 32, 32);
      R.textColor(`'${letter}'`, R.width - 24, 250, '#88c070', 6, 'center');
      R.textColor(getOrientation(letter), R.width - 24, 260, '#555', 3, 'center');

      // Real-time coaching hints — tell user what to fix
      const feedback = getSignFeedback(currentLandmarks, letter);
      if (feedback.length > 0 && handDetected) {
        R.rectColor(4, 212, 94, 44, 'rgba(0,0,0,0.75)');
        R.textColor('FIX:', 6, 214, '#e05050', 5);
        const maxHints = Math.min(3, feedback.length);
        for (let i = 0; i < maxHints; i++) {
          R.textColor(feedback[i], 6, 224 + i * 10, '#ebcb8b', 4);
        }
      } else if (handDetected && holdTimer > 0) {
        R.rectColor(4, 212, 94, 16, 'rgba(0,0,0,0.75)');
        R.textColor('LOOKING GOOD!', 6, 214, '#88c070', 5);
      }

      // Compact debug — what signs match
      const debug = getHandDebugInfo(currentLandmarks);
      if (debug) {
        const matchStr = debug.matches.length > 0 ? debug.matches.join(' ') : '-';
        R.textColor(`DETECTED: ${matchStr}`, 6, 272, '#444', 4);
      }
      break;
    }

    case 'correct': {
      const letter = currentSign();
      const bounce = Math.sin(lessonTimer / 150) * 3;
      R.textColor('\u2713 CORRECT!', R.width / 2, 60 + bounce, '#88c070', 12, 'center');
      R.textColor(`'${letter}' MASTERED`, R.width / 2, 90, '#e0f8d0', 8, 'center');

      const img = signImages[letter];
      drawSign(letter, R.width / 2 - 30, 110, 60, 60);

      R.textColor(`+${Math.floor(lessonData.xp / lessonData.signs.length)} XP`, R.width / 2, 180, '#ebcb8b', 8, 'center');

      drawButtons();
      break;
    }

    case 'wrong': {
      const letter = currentSign();
      R.textColor('WRONG', R.width / 2, 50, '#e05050', 12, 'center');
      R.textColor(`THE SIGN FOR '${letter}':`, R.width / 2, 80, '#e0f8d0', 6, 'center');

      const img = signImages[letter];
      drawSign(letter, R.width / 2 - 35, 95, 70, 70);

      R.textColor(getOrientation(letter), R.width / 2, 172, '#ebcb8b', 5, 'center');

      if (!State.hasHearts()) {
        R.textColor('NO HEARTS LEFT!', R.width / 2, 190, '#e05050', 7, 'center');
      }

      drawButtons();
      break;
    }
  }
}

// ─── Scene: Complete ───────────────────────────────────
let completeStars = 0;
let completeXP = 0;
let completeLessonId = 0;

function initComplete(data) {
  completeStars = data.stars;
  completeXP = data.xp;
  completeLessonId = data.lessonId;
  SFX.levelClear();
}

function updateComplete(dt) {
  sceneTimer += dt;
  clearButtons();

  if (sceneTimer > 2500) {
    btn('cont', 30, 240, 100, 22, 'CONTINUE', 'primary');
  }

  // Straight from the lesson into its review checkpoint — that's the gate on
  // the next lesson, so don't make the player go hunting for it.
  const afterComplete = () => {
    SFX.select();
    if (State.isCheckpointPassed(completeLessonId)) goTo('home');
    else goTo('quiz', { lessonId: completeLessonId });
  };

  const tap = consumeTap();
  if (tap && sceneTimer > 2500) {
    const b = hitButton(tap.x, tap.y);
    if (b?.id === 'cont') afterComplete();
  }
  if ((keys['z'] || keys['Enter']) && sceneTimer > 2500) {
    keys['z'] = false; keys['Enter'] = false;
    afterComplete();
  }
}

function drawComplete() {
  R.clear(0);

  R.textColor('LESSON', R.width / 2, 30, '#88c070', 10, 'center');
  R.textColor('COMPLETE!', R.width / 2, 48, '#e0f8d0', 10, 'center');

  // Stars animation
  const starsY = 80;
  for (let i = 0; i < 3; i++) {
    const delay = i * 400;
    if (sceneTimer > delay + 500) {
      const filled = i < completeStars;
      const bounce = sceneTimer - delay - 500 < 200 ? Math.sin((sceneTimer - delay - 500) / 100 * Math.PI) * 5 : 0;
      R.textColor(filled ? '\u2605' : '\u2606', R.width / 2 - 25 + i * 25, starsY - bounce, filled ? '#ebcb8b' : '#444', 14, 'center');
    }
  }

  // XP
  if (sceneTimer > 1800) {
    R.textColor(`+${completeXP} XP`, R.width / 2, 120, '#ebcb8b', 10, 'center');
  }

  // Streak
  if (sceneTimer > 2200) {
    const st = State.getState();
    // Measure the centered text so the flame sits just left of its actual left
    // edge — a fixed offset drifts as the streak grows from 1 to 3 digits.
    const streakText = `${st.streak} DAY STREAK!`;
    const textW = R.measureText(streakText, 6);
    R.textColor(streakText, R.width / 2, 154, '#e8c170', 6, 'center');
    const flicker = Math.sin(sceneTimer / 120) > 0 ? 0 : 1;
    R.flame(R.width / 2 - textW / 2 - 11, 150, 1, flicker);
  }

  // Signs learned
  if (sceneTimer > 1400) {
    const lesson = State.getLesson(completeLessonId);
    if (lesson) {
      R.textColor('SIGNS LEARNED:', R.width / 2, 185, '#88c070', 6, 'center');
      const signs = lesson.signs;
      const spacing = 30;
      const startX = R.width / 2 - (signs.length * spacing) / 2;
      signs.forEach((letter, i) => {
        R.textColor(letter, startX + i * spacing + spacing / 2, 200, '#e0f8d0', 10, 'center');
      });
    }
  }

  drawButtons();
}

// ─── Scene: Profile ────────────────────────────────────
function initProfile() {}

function updateProfile(dt) {
  sceneTimer += dt;
  clearButtons();
  btn('back', 4, 4, 40, 14, '< BACK', 'small');

  const tap = consumeTap();
  if (tap) {
    const b = hitButton(tap.x, tap.y);
    if (b?.id === 'back') { SFX.select(); goTo('home'); }
  }
  if (keys['x'] || keys['Escape']) { keys['x'] = false; keys['Escape'] = false; SFX.select(); goTo('home'); }
}

function drawProfile() {
  R.clear(0);
  R.rect(0, 0, R.width, 20, 1);
  R.textColor('PROFILE', R.width / 2, 5, '#e0f8d0', 8, 'center');
  drawButtons();

  const st = State.getState();

  // Stats
  R.textColor('STATS', R.width / 2, 32, '#88c070', 7, 'center');
  R.rect(10, 44, R.width - 20, 2, 1);

  R.textColor(`XP: ${st.xp}`, 16, 55, '#ebcb8b', 7);
  R.textColor(`STREAK: ${st.streak}`, 16, 70, '#e8c170', 7);
  R.textColor(`LESSONS: ${st.completedLessons.length}/${State.getTotalLessons()}`, 16, 85, '#88c070', 7);
  R.textColor(`SIGNS: ${st.masteredSigns.length}/14`, 16, 100, '#88c070', 7);

  // Mastered signs grid
  R.rect(10, 118, R.width - 20, 2, 1);
  R.textColor('MASTERED SIGNS', R.width / 2, 128, '#88c070', 6, 'center');

  SIGN_LETTERS.forEach((letter, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x = 14 + col * 20;
    const y = 146 + row * 28;
    const mastered = st.masteredSigns.includes(letter);
    R.rectColor(x, y, 16, 20, mastered ? '#1a3a2a' : '#111');
    R.textColor(letter, x + 8, y + 2, mastered ? '#e0f8d0' : '#333', 7, 'center');
    if (mastered) {
      R.textColor('\u2713', x + 8, y + 13, '#88c070', 4, 'center');
    }
  });

  // Lesson progress
  R.rect(10, 210, R.width - 20, 2, 1);
  R.textColor('LESSONS', R.width / 2, 220, '#88c070', 6, 'center');

  State.LESSONS.forEach((lesson, i) => {
    const y = 236 + i * 14;
    const complete = State.isLessonComplete(lesson.id);
    const stars = st.bestStars[lesson.id] || 0;
    R.textColor(complete ? '\u2713' : '\u2022', 16, y, complete ? '#88c070' : '#333', 6);
    R.textColor(lesson.name, 28, y, complete ? '#e0f8d0' : '#555', 6);
    if (complete) {
      for (let s = 0; s < 3; s++) {
        R.textColor(s < stars ? '\u2605' : '\u2606', R.width - 36 + s * 10, y, s < stars ? '#ebcb8b' : '#444', 5);
      }
    }
  });
}

// ─── Scene: Quiz (receptive practice) ──────────────────
// The lesson scene trains expressive skill — make the shape, camera confirms.
// This trains the receptive side: read a shape and name it. In fingerspelling
// that's the harder direction, and it doesn't come free with expressive practice.

// Shapes that actually get confused with each other. Better distractors than
// random letters, because they force the discriminating detail to be noticed.
const CONFUSABLE = {
  A: ['O', 'C', 'I'], B: ['W', 'U', 'C'], C: ['O', 'A', 'B'], D: ['F', 'L', 'I'],
  F: ['D', 'B', 'O'], I: ['Y', 'A', 'D'], K: ['V', 'U', 'R'], L: ['D', 'Y', 'I'],
  O: ['C', 'A', 'F'], R: ['U', 'V', 'K'], U: ['V', 'R', 'K'], V: ['U', 'R', 'W'],
  W: ['V', 'B', 'U'], Y: ['I', 'L', 'A'],
};

const QUIZ_LEN = 8;
const QUIZ_MAX_MISSES = 1;   // misses allowed before a checkpoint fails
const FEEDBACK_MS = 900;

let quizQueue = [];
let quizIndex = 0;
let quizFirstTryMisses = 0;
let quizPhase = 'ask';       // 'ask' | 'feedback' | 'result'
let quizFeedbackTimer = 0;
let quizLastCorrect = false;
let quizPickedIdx = -1;
let quizLessonId = 0;
let quizTotal = QUIZ_LEN;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickDistractors(answer, count) {
  const near = (CONFUSABLE[answer] || []).filter(l => SIGN_LETTERS.includes(l) && l !== answer);
  const rest = shuffle(SIGN_LETTERS.filter(l => l !== answer && !near.includes(l)));
  // Distractors come from all 14 shapes, not just signs learned so far —
  // after lesson 1 there'd only be two other candidates otherwise.
  return [...shuffle(near), ...rest].slice(0, count);
}

function makeQuestion(answer, type) {
  return { type, answer, choices: shuffle([answer, ...pickDistractors(answer, 3)]) };
}

function buildQuizQuestions(pool, n) {
  if (!pool.length) return [];
  const order = shuffle(pool);
  const qs = [];
  for (let i = 0; i < n; i++) {
    // Alternate direction so both reading and naming get practised
    qs.push(makeQuestion(order[i % order.length], i % 2 === 0 ? 'img2letter' : 'letter2img'));
  }
  return shuffle(qs);
}

function initQuiz(data) {
  quizLessonId = data.lessonId;
  const learned = State.getLearnedSigns();
  const pool = (data.signs?.length ? data.signs : learned).filter(l => SIGN_LETTERS.includes(l));
  quizQueue = buildQuizQuestions(pool, QUIZ_LEN);
  quizTotal = quizQueue.length;
  quizIndex = 0;
  quizFirstTryMisses = 0;
  quizFeedbackTimer = 0;
  quizPickedIdx = -1;
  quizPhase = 'ask';
  if (!quizQueue.length) enterQuizResult();
  playBGM('lofiFocus');
}

function quizPassed() { return quizFirstTryMisses <= QUIZ_MAX_MISSES; }

// Single entry point into the result phase, so the checkpoint is always
// recorded — whichever way the quiz ended.
function enterQuizResult() {
  quizPhase = 'result';
  sceneTimer = 0;
  if (quizPassed()) {
    State.passCheckpoint(quizLessonId);
    State.addXP(10);
    SFX.badge();
  }
}

// Choice hit-boxes. Letters are a 2x2 button grid; images a 2x2 tile grid.
function quizChoiceRects(type) {
  return type === 'img2letter'
    ? [{ x: 14, y: 172, w: 60, h: 26 }, { x: 86, y: 172, w: 60, h: 26 },
       { x: 14, y: 206, w: 60, h: 26 }, { x: 86, y: 206, w: 60, h: 26 }]
    : [{ x: 18, y: 108, w: 52, h: 52 }, { x: 90, y: 108, w: 52, h: 52 },
       { x: 18, y: 172, w: 52, h: 52 }, { x: 90, y: 172, w: 52, h: 52 }];
}

// Feedback sits in the gap between the prompt and the choices, which is at a
// different height for each question type.
const QUIZ_FEEDBACK_Y = { img2letter: 150, letter2img: 90 };

function answerQuiz(idx) {
  const q = quizQueue[quizIndex];
  const correct = q.choices[idx] === q.answer;
  quizPickedIdx = idx;
  quizLastCorrect = correct;
  State.recordQuizAnswer(q.answer, correct);

  if (correct) {
    SFX.success();
  } else {
    SFX.wrong();
    // Requeued items are the second look at something already missed — don't
    // let one mistake count twice against the checkpoint.
    if (!q.requeued) quizFirstTryMisses++;
    // Re-ask a missed sign a few questions later, still in this session
    const insertAt = Math.min(quizQueue.length, quizIndex + 3);
    quizQueue.splice(insertAt, 0, { ...q, choices: shuffle(q.choices), requeued: true });
  }
  quizPhase = 'feedback';
  quizFeedbackTimer = 0;
}

function updateQuiz(dt) {
  sceneTimer += dt;
  clearButtons();

  if (quizPhase === 'feedback') {
    quizFeedbackTimer += dt;
    if (quizFeedbackTimer >= FEEDBACK_MS) {
      quizIndex++;
      quizPickedIdx = -1;
      if (quizIndex >= quizQueue.length) enterQuizResult();
      else { quizPhase = 'ask'; sceneTimer = 0; }
    }
    return;
  }

  if (quizPhase === 'result') {
    const passed = quizPassed();
    btn('done', 30, 230, 100, 22, passed ? 'CONTINUE' : 'TRY AGAIN', 'primary');
    const tap = consumeTap();
    const key = keys['z'] || keys['Enter'];
    if ((tap && hitButton(tap.x, tap.y)?.id === 'done') || key) {
      keys['z'] = false; keys['Enter'] = false;
      SFX.select();
      if (passed) goTo('home');
      else goTo('quiz', { lessonId: quizLessonId });
    }
    return;
  }

  // 'ask'
  const q = quizQueue[quizIndex];
  if (!q) { quizPhase = 'result'; return; }
  const rects = quizChoiceRects(q.type);
  rects.forEach((r, i) => btn(`c${i}`, r.x, r.y, r.w, r.h, q.choices[i], 'quiz'));

  const tap = consumeTap();
  if (tap) {
    const b = hitButton(tap.x, tap.y);
    if (b?.id?.startsWith('c')) answerQuiz(Number(b.id.slice(1)));
  }
  // Keyboard 1-4 for desktop
  for (let i = 0; i < 4; i++) {
    if (keys[String(i + 1)]) { keys[String(i + 1)] = false; answerQuiz(i); break; }
  }
}

function drawQuiz() {
  R.clear(0);

  if (quizPhase === 'result') {
    const passed = quizPassed();
    R.textColor(passed ? 'CHECKPOINT' : 'NOT QUITE', R.width / 2, 60, passed ? '#88c070' : '#e05050', 10, 'center');
    R.textColor(passed ? 'CLEARED!' : 'KEEP GOING', R.width / 2, 78, passed ? '#e0f8d0' : '#ebcb8b', 10, 'center');
    R.textColor(`${quizTotal - quizFirstTryMisses}/${quizTotal} FIRST TRY`, R.width / 2, 120, '#88c070', 6, 'center');
    if (passed) {
      R.textColor('+10 XP', R.width / 2, 140, '#e8c170', 8, 'center');
      R.textColor('NEXT LESSON', R.width / 2, 168, '#88c070', 5, 'center');
      R.textColor('UNLOCKED', R.width / 2, 178, '#88c070', 5, 'center');
    } else {
      R.textColor(`MISS ${QUIZ_MAX_MISSES} OR FEWER`, R.width / 2, 150, '#555', 5, 'center');
      R.textColor('TO UNLOCK', R.width / 2, 160, '#555', 5, 'center');
    }
    drawButtons();
    return;
  }

  const q = quizQueue[quizIndex];
  if (!q) return;

  // Progress
  R.textColor(`${Math.min(quizIndex + 1, quizQueue.length)}/${quizQueue.length}`, R.width - 8, 10, '#555', 5, 'right');
  R.progressBarColor(8, 12, R.width - 40, 5, quizIndex / quizQueue.length, '#1a1a1a', '#346856');
  R.textColor('REVIEW', 8, 24, '#88c070', 6);

  const rects = quizChoiceRects(q.type);

  if (q.type === 'img2letter') {
    R.textColor('WHICH LETTER?', R.width / 2, 40, '#e0f8d0', 8, 'center');
    const img = signImages[q.answer];
    const size = 84;
    const ix = (R.width - size) / 2, iy = 58;
    R.rectColor(ix - 3, iy - 3, size + 6, size + 6, '#e0f8d0');
    // Mirrored to match the selfie view the learner practises against
    drawSign(q.answer, ix, iy, size, size);
    rects.forEach((r, i) => {
      const state = quizChoiceState(q, i);
      R.rectColor(r.x, r.y, r.w, r.h, state.bg);
      R.strokeRect(r.x, r.y, r.w, r.h, 1);
      R.textColor(q.choices[i], r.x + r.w / 2, r.y + 8, state.fg, 10, 'center');
    });
  } else {
    R.textColor('PICK THE SIGN', R.width / 2, 40, '#e0f8d0', 8, 'center');
    R.textColor(q.answer, R.width / 2, 58, '#e8c170', 24, 'center');
    rects.forEach((r, i) => {
      const state = quizChoiceState(q, i);
      R.rectColor(r.x - 2, r.y - 2, r.w + 4, r.h + 4, state.bg);
      R.rectColor(r.x, r.y, r.w, r.h, '#e0f8d0');
      const img = signImages[q.choices[i]];
      drawSign(q.choices[i], r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    });
  }

  if (quizPhase === 'feedback') {
    R.textColor(quizLastCorrect ? 'CORRECT!' : `IT WAS '${q.answer}'`,
      R.width / 2, QUIZ_FEEDBACK_Y[q.type], quizLastCorrect ? '#88c070' : '#e05050', 7, 'center');
  }
}

// Colours for a choice: neutral while asking, right/wrong once answered.
function quizChoiceState(q, i) {
  if (quizPhase !== 'feedback') return { bg: '#1a3a2a', fg: '#e0f8d0' };
  if (q.choices[i] === q.answer) return { bg: '#346856', fg: '#e0f8d0' };
  if (i === quizPickedIdx) return { bg: '#5a1a1a', fg: '#e05050' };
  return { bg: '#1a1a1a', fg: '#555' };
}

// ─── Scene Registry ────────────────────────────────────
const sceneInits = { home: initHome, map: initMap, lesson: initLesson, complete: initComplete, profile: initProfile, quiz: initQuiz };
const sceneUpdates = { home: updateHome, map: updateMap, lesson: updateLesson, complete: updateComplete, profile: updateProfile, quiz: updateQuiz };
const sceneDraws = { home: drawHome, map: drawMap, lesson: drawLesson, complete: drawComplete, profile: drawProfile, quiz: drawQuiz };

// ─── Music toggle (global, all scenes) ─────────────────
// Hit area is deliberately larger than the 7x7 icon — it has to be thumb-sized
// on a phone. Bottom-right is the one corner no scene draws into.
const MUTE_ICON = { x: 145, y: 272 };
const MUTE_HIT = { x: 138, y: 266, w: 22, h: 22 };

// Returns true if it swallowed the tap, so the scene beneath doesn't also act.
function consumeMuteTap() {
  if (!tapped) return false;
  const h = MUTE_HIT;
  if (tapX < h.x || tapX > h.x + h.w || tapY < h.y || tapY > h.y + h.h) return false;
  tapped = false;
  toggleMute();
  SFX.select();   // an effect, not music — still audible while muted
  return true;
}

function drawMuteToggle() {
  const muted = isMuted();
  // Opaque chip behind the glyph: the profile's lesson list and the lesson HUD
  // run underneath it, and without a backing the icon gets lost in the text.
  R.rectColor(141, 268, 15, 15, '#081820');
  R.strokeRectColor(141, 268, 15, 15, muted ? '#5a1a1a' : '#1a3a2a');
  R.speakerIcon(MUTE_ICON.x, MUTE_ICON.y, 1, muted, muted ? '#e05050' : '#88c070');
}

// ─── Game Loop ─────────────────────────────────────────
let lastTime = 0;

let loopErrorLogged = false;

// A throw anywhere in here used to skip the requestAnimationFrame at the bottom,
// which killed the loop for good: the last frame stayed on screen and every
// button went dead. Always re-arm, and report the first failure.
function gameLoop(time) {
  try {
    stepFrame(time);
  } catch (e) {
    if (!loopErrorLogged) {
      loopErrorLogged = true;
      console.error('[SignalQuest] frame failed; loop continues', e);
    }
  }
  requestAnimationFrame(gameLoop);
}

function stepFrame(time) {
  const dt = lastTime ? Math.min(time - lastTime, 100) : 16;
  lastTime = time;

  // Update transition
  if (transitionPhase === 'closing') {
    transitionTimer += dt;
    if (transitionTimer >= TRANSITION_SPEED) {
      finishTransition();
    }
  } else if (transitionPhase === 'opening') {
    transitionTimer += dt;
    if (transitionTimer >= TRANSITION_SPEED) {
      transitionPhase = 'none';
    }
  }

  // The music toggle gets first look at the tap, so it works from every scene
  // without each one having to know about it. Checked outside the transition
  // gate as well: it isn't navigation, so it shouldn't go dead during a wipe.
  const muteTapped = consumeMuteTap();

  // Update scene
  if (!muteTapped && (transitionPhase === 'none' || transitionPhase === 'opening')) {
    const update = sceneUpdates[scene];
    if (update) update(dt);
  }

  // Draw. Reset transform/alpha up front: if a previous frame threw between
  // save() and restore(), its state would otherwise leak into this one.
  R.ctx.setTransform(1, 0, 0, 1, 0, 0);
  R.ctx.globalAlpha = 1;
  R.ctx.save();
  R.applyEffects(dt);

  const draw = sceneDraws[scene];
  if (draw) draw();

  drawMuteToggle();

  R.drawFlash();

  // Transition overlay
  if (transitionPhase === 'closing') {
    R.irisWipe(transitionTimer / TRANSITION_SPEED);
  } else if (transitionPhase === 'opening') {
    R.irisWipe(1 - transitionTimer / TRANSITION_SPEED);
  }

  R.ctx.restore();
}

// ─── Init ──────────────────────────────────────────────
State.loadState();
initHome();
initWebcam();
requestAnimationFrame(gameLoop);
