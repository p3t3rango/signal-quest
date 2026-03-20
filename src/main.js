// Signal Quest: Color Edition - Main Game Engine
import { Renderer } from './renderer.js';
import { SFX, playBGM, stopBGM } from './audio.js';
import { detectSign, SIGN_DESCRIPTIONS, ZONES, getDetectableLetters } from './signs.js';
import * as State from './gamestate.js';
import {
  PLAYER_DOWN, PLAYER_UP, PLAYER_LEFT, PLAYER_RIGHT,
  NPC_SENSEI, GATE_LOCKED, SIGN_POST, TREE, HOUSE, CHECKPOINT,
  BADGE_ICON, TILES, TILE_COLORS
} from './sprites.js';
import { getOrientation, getHandSide } from './handdraw.js';

// ─── Setup ─────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const R = new Renderer(canvas);

// ─── Preload ASL reference SVGs (public domain, Wikimedia Commons) ───
const signImages = {};
const SIGN_LETTERS = ['A','B','C','D','F','I','K','L','O','R','U','V','W','Y'];
let signImagesLoaded = 0;
SIGN_LETTERS.forEach(letter => {
  const img = new Image();
  img.onload = () => { signImagesLoaded++; };
  img.src = `/signs/${letter}.svg`;
  signImages[letter] = img;
});
const videoEl = document.getElementById('webcam-video');
const processCanvas = document.getElementById('webcam-process');
processCanvas.width = R.canvas.width;
processCanvas.height = R.canvas.height;

// Side panel webcam display
const webcamDisplay = document.getElementById('webcam-display');
const webcamDisplayCtx = webcamDisplay ? webcamDisplay.getContext('2d') : null;
if (webcamDisplay) { webcamDisplay.width = 256; webcamDisplay.height = 192; }
const camStatusEl = document.getElementById('cam-status');
const handStatusEl = document.getElementById('hand-status');

// ─── Input ─────────────────────────────────────────────
const keys = {};
const justPressed = {};

document.addEventListener('keydown', e => {
  if (!keys[e.key]) justPressed[e.key] = true;
  keys[e.key] = true;
  e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

function isJustPressed(key) {
  return justPressed[key];
}

function clearJustPressed() {
  for (const k in justPressed) justPressed[k] = false;
}

// ─── Touch Controls ───────────────────────────────────
function initTouchControls() {
  const touchMap = {
    'dpad-up':    'ArrowUp',
    'dpad-down':  'ArrowDown',
    'dpad-left':  'ArrowLeft',
    'dpad-right': 'ArrowRight',
    'btn-a':      'z',
    'btn-b':      'x',
  };

  // Also detect touch capability via JS and force-show the overlay
  const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (hasTouchScreen) {
    const overlay = document.getElementById('touch-controls');
    if (overlay) overlay.style.display = 'flex';
  }

  Object.entries(touchMap).forEach(([btnId, keyName]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!keys[keyName]) justPressed[keyName] = true;
      keys[keyName] = true;
    }, { passive: false });

    btn.addEventListener('touchend', e => {
      e.preventDefault();
      keys[keyName] = false;
    }, { passive: false });

    btn.addEventListener('touchcancel', e => {
      keys[keyName] = false;
    });

    // Prevent context menu on long press
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });

  // Prevent default touch behaviors on the game canvas (scrolling, zooming)
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

// ─── Responsive Canvas ────────────────────────────────
function initResponsiveCanvas() {
  function resizeCanvas() {
    const frame = document.getElementById('canvas-frame');
    if (!frame) return;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    // Game aspect ratio is 160:144
    const gameAspect = 160 / 144;
    let displayW, displayH;
    if (frameW / frameH > gameAspect) {
      // Frame is wider than game — fit to height
      displayH = frameH;
      displayW = frameH * gameAspect;
    } else {
      // Frame is taller than game — fit to width
      displayW = frameW;
      displayH = frameW / gameAspect;
    }
    canvas.style.width = Math.floor(displayW) + 'px';
    canvas.style.height = Math.floor(displayH) + 'px';
  }

  window.addEventListener('resize', resizeCanvas);
  // Also handle orientation change on mobile
  window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 100);
  });
  resizeCanvas();
}

// ─── Webcam ────────────────────────────────────────────
let webcamReady = false;
let handsInstance = null;
let currentLandmarks = null;
let handDetected = false;

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    webcamReady = true;
    if (camStatusEl) { camStatusEl.textContent = 'CAM: ACTIVE'; camStatusEl.classList.add('active'); }
    initMediaPipe();
  } catch (err) {
    console.warn('Webcam not available:', err);
    if (camStatusEl) { camStatusEl.textContent = 'CAM: UNAVAILABLE'; }
    if (handStatusEl) { handStatusEl.textContent = 'Camera not available — allow access in browser'; }
  }
}

function initMediaPipe() {
  // Load MediaPipe Hands
  const script1 = document.createElement('script');
  script1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
  script1.onload = () => {
    const script2 = document.createElement('script');
    script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
    script2.onload = () => {
      setupHands();
    };
    document.head.appendChild(script2);
  };
  document.head.appendChild(script1);
}

function setupHands() {
  if (typeof Hands === 'undefined') {
    console.warn('MediaPipe Hands not loaded');
    return;
  }
  handsInstance = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  handsInstance.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });
  handsInstance.onResults(results => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      currentLandmarks = results.multiHandLandmarks[0];
      handDetected = true;
      if (handStatusEl) { handStatusEl.textContent = 'HAND DETECTED'; handStatusEl.className = 'detected'; }
    } else {
      currentLandmarks = null;
      handDetected = false;
      if (handStatusEl) { handStatusEl.textContent = 'Show your hand to the camera'; handStatusEl.className = ''; }
    }
  });

  // Start camera loop
  const cam = new Camera(videoEl, {
    onFrame: async () => {
      if (handsInstance) await handsInstance.send({ image: videoEl });
    },
    width: 320,
    height: 240,
  });
  cam.start();
}

// ─── Scene System ──────────────────────────────────────
let currentScene = 'title';
let sceneData = {};
let transitionTimer = 0;
let transitionTarget = null;
let transitionPhase = 'none'; // 'none' | 'closing' | 'black' | 'opening'
const TRANSITION_DURATION = 400; // ms per phase
const TRANSITION_PAUSE = 120;   // ms hold on black

function switchScene(name, data = {}) {
  if (transitionPhase !== 'none') return; // prevent double-trigger
  transitionTarget = name;
  sceneData = data;
  transitionTimer = 0;
  transitionPhase = 'closing';
}

function finishTransition() {
  currentScene = transitionTarget;
  transitionTarget = null;
  if (sceneInits[currentScene]) sceneInits[currentScene]();
}

// ─── Scene: Title ──────────────────────────────────────
let titleBlink = 0;
let titleStarted = false;

function initTitle() {
  titleBlink = 0;
  titleStarted = false;
  playBGM('title');
}

function updateTitle(dt) {
  titleBlink += dt;
  if (isJustPressed('Enter') || isJustPressed('z') || isJustPressed(' ')) {
    SFX.start();
    stopBGM();
    titleStarted = true;
    State.loadState();
    setTimeout(() => switchScene('worldmap'), 400);
  }
}

function drawTitle() {
  R.clear(0);
  // Draw decorative border
  R.rect(4, 4, R.width - 8, R.height - 8, 1);
  R.rect(6, 6, R.width - 12, R.height - 12, 0);

  // Title
  R.text('SIGNAL', R.width / 2, 24, 3, 16, 'center');
  R.text('QUEST', R.width / 2, 44, 2, 16, 'center');
  R.textColor('COLOR EDITION', R.width / 2, 66, '#e05050', 6, 'center');

  // Decorative hand sprites
  R.text('ASL', R.width / 2, 82, 2, 8, 'center');

  // Draw a pixelated hand icon
  const handY = 92;
  R.rect(70, handY, 20, 20, 1);
  R.rect(72, handY + 2, 16, 16, 2);
  R.text('✌', 74, handY + 3, 3, 12);

  // Blink prompt
  if (Math.floor(titleBlink / 500) % 2 === 0) {
    R.text('PRESS START', R.width / 2, 120, 3, 8, 'center');
  }

  // Credits
  R.text('v1.0', R.width / 2, 136, 1, 6, 'center');
}

// ─── Scene: World Map ──────────────────────────────────
let mapCursor = 0;
let mapBounce = 0;
const MAP_NODE_POSITIONS = [
  { x: 30, y: 100 },
  { x: 60, y: 60 },
  { x: 100, y: 80 },
  { x: 140, y: 40 },
];

function initWorldMap() {
  mapCursor = State.getState().currentZone;
  mapBounce = 0;
  playBGM('overworld');
}

function updateWorldMap(dt) {
  mapBounce += dt;

  if (isJustPressed('ArrowRight') || isJustPressed('ArrowDown')) {
    const next = mapCursor + 1;
    if (next < ZONES.length) {
      mapCursor = next;
      SFX.move();
    }
  }
  if (isJustPressed('ArrowLeft') || isJustPressed('ArrowUp')) {
    if (mapCursor > 0) {
      mapCursor--;
      SFX.move();
    }
  }
  if (isJustPressed('z') || isJustPressed('Enter')) {
    if (State.isZoneUnlocked(mapCursor)) {
      SFX.select();
      State.setCurrentZone(mapCursor);
      stopBGM();
      switchScene('overworld');
    } else {
      SFX.blocked();
      R.shake(2, 200);
    }
  }
  // Profile screen
  if (isJustPressed('x')) {
    SFX.select();
    switchScene('profile');
  }
}

function drawWorldMap() {
  R.clear(0);

  // Draw webcam bg
  if (webcamReady) {
    R.drawWebcamGBC(videoEl, processCanvas, 0.15);
  }

  // Title bar
  R.rect(0, 0, R.width, 14, 1);
  R.text('WORLD MAP', R.width / 2, 3, 3, 8, 'center');

  // Draw paths between nodes
  R.ctx.strokeStyle = R.palette[1];
  R.ctx.lineWidth = 2;
  R.ctx.setLineDash([3, 3]);
  for (let i = 0; i < MAP_NODE_POSITIONS.length - 1; i++) {
    const a = MAP_NODE_POSITIONS[i];
    const b = MAP_NODE_POSITIONS[i + 1];
    R.ctx.beginPath();
    R.ctx.moveTo(a.x, a.y);
    R.ctx.lineTo(b.x, b.y);
    R.ctx.stroke();
  }
  R.ctx.setLineDash([]);

  // Draw nodes
  ZONES.forEach((zone, i) => {
    const pos = MAP_NODE_POSITIONS[i];
    const unlocked = State.isZoneUnlocked(i);
    const complete = State.isZoneComplete(zone.id);
    const selected = i === mapCursor;
    const bounce = selected ? Math.sin(mapBounce / 200) * 3 : 0;

    // Node circle
    const color = unlocked ? (complete ? 3 : 2) : 1;
    R.rect(pos.x - 8, pos.y - 8 + bounce, 16, 16, color);
    R.strokeRect(pos.x - 8, pos.y - 8 + bounce, 16, 16, selected ? 3 : 0);

    // Zone number
    R.text(`${i + 1}`, pos.x, pos.y - 3 + bounce, unlocked ? 0 : 1, 8, 'center');

    // Lock icon for locked zones
    if (!unlocked) {
      R.text('X', pos.x, pos.y - 3 + bounce, 0, 8, 'center');
    }

    // Badge star for completed zones
    if (complete) {
      R.textColor('★', pos.x - 2, pos.y - 14 + bounce, zone.badgeColor, 8);
    }
  });

  // Info panel at bottom
  const zone = ZONES[mapCursor];
  R.rect(0, 108, R.width, 36, 1);
  R.rect(2, 110, R.width - 4, 32, 0);
  R.text(zone.name, 6, 113, 3, 7);
  if (!State.isZoneUnlocked(mapCursor)) {
    R.textColor('LOCKED', 6, 123, '#e05050', 6);
  } else if (State.isZoneComplete(zone.id)) {
    R.textColor('CLEAR!', 6, 123, '#88c070', 6);
    R.text(zone.description, 6, 132, 2, 6);
  } else {
    R.text(zone.description, 6, 123, 2, 6);
    R.text('A:ENTER', R.width - 6, 132, 2, 6, 'right');
  }

  // Controls hint
  R.text('B:PROFILE', 6, 136, 1, 6);

  R.drawFlash();
}

// ─── Scene: Overworld ──────────────────────────────────
let playerX, playerY;
let playerDir = 'down';
let walkTimer = 0;
let overworldNPCs = [];
let overworldGates = [];
let currentNPCIndex = -1;
let overworldMessage = null;
let messageTimer = 0;

function initOverworld() {
  const zone = State.getCurrentZone();
  const zoneIdx = State.getState().currentZone;
  playerX = 80;
  playerY = 120;
  playerDir = 'down';
  walkTimer = 0;
  currentNPCIndex = -1;
  overworldMessage = null;

  // Create NPCs and gates for current zone
  overworldNPCs = [];
  overworldGates = [];
  const letters = zone.letters;
  const challengeIdx = State.getState().currentChallenge;

  letters.forEach((letter, i) => {
    const completed = State.getState().completedSigns.includes(letter);
    const x = 30 + i * 40;
    const y = 50 + (i % 2) * 20;
    overworldNPCs.push({
      letter,
      x, y,
      completed,
      active: i <= challengeIdx || completed,
    });
  });

  // Gate at the end
  overworldGates.push({
    x: 140,
    y: 16,
    open: State.isZoneComplete(zone.id),
  });

  // If auto-advancing from challenge complete, position player near next uncompleted NPC
  if (sceneData.autoAdvance) {
    const nextNPC = overworldNPCs.find(npc => !npc.completed && npc.active);
    if (nextNPC) {
      playerX = nextNPC.x;
      playerY = nextNPC.y + 20;
      playerDir = 'up';
    } else if (overworldGates[0] && overworldGates[0].open) {
      // All NPCs done, position near gate
      playerX = overworldGates[0].x;
      playerY = overworldGates[0].y + 20;
      playerDir = 'up';
    }
  }

  playBGM('overworld');
}

function updateOverworld(dt) {
  walkTimer += dt;

  if (overworldMessage) {
    messageTimer -= dt;
    if (messageTimer <= 0 || isJustPressed('z') || isJustPressed('Enter')) {
      overworldMessage = null;
    }
    return;
  }

  // Movement
  const speed = 1.5;
  let moving = false;
  if (keys['ArrowLeft']) { playerX -= speed; playerDir = 'left'; moving = true; }
  if (keys['ArrowRight']) { playerX += speed; playerDir = 'right'; moving = true; }
  if (keys['ArrowUp']) { playerY -= speed; playerDir = 'up'; moving = true; }
  if (keys['ArrowDown']) { playerY += speed; playerDir = 'down'; moving = true; }

  // Clamp
  playerX = Math.max(4, Math.min(R.width - 12, playerX));
  playerY = Math.max(4, Math.min(R.height - 20, playerY));

  // Check NPC proximity (center-to-center, generous radius)
  const INTERACT_RADIUS = 28;
  const HIGHLIGHT_RADIUS = 36;
  currentNPCIndex = -1;
  for (let i = 0; i < overworldNPCs.length; i++) {
    const npc = overworldNPCs[i];
    const dist = Math.hypot(playerX - npc.x, playerY - npc.y);
    if (dist < HIGHLIGHT_RADIUS) {
      currentNPCIndex = i; // track nearest NPC for visual prompt
      break;
    }
  }

  // Check NPC interaction
  if (isJustPressed('z') || isJustPressed('Enter')) {
    for (let i = 0; i < overworldNPCs.length; i++) {
      const npc = overworldNPCs[i];
      const dist = Math.hypot(playerX - npc.x, playerY - npc.y);
      if (dist < INTERACT_RADIUS) {
        if (npc.completed) {
          overworldMessage = `You mastered '${npc.letter}'!`;
          messageTimer = 2000;
          SFX.select();
        } else if (npc.active) {
          SFX.select();
          stopBGM();
          switchScene('battle', { letter: npc.letter, npcIndex: i });
        } else {
          overworldMessage = 'Complete previous\nsigns first!';
          messageTimer = 2000;
          SFX.blocked();
        }
        break;
      }
    }

    // Check gate
    const gate = overworldGates[0];
    if (gate) {
      const dist = Math.hypot(playerX - gate.x, playerY - gate.y);
      if (dist < 20) {
        const zone = State.getCurrentZone();
        const allDone = zone.letters.every(l => State.getState().completedSigns.includes(l));
        if (allDone && !State.isZoneComplete(zone.id)) {
          // Earn badge!
          const badge = State.earnBadge(zone.id);
          SFX.badge();
          stopBGM();
          switchScene('badge', { zone });
        } else if (State.isZoneComplete(zone.id)) {
          overworldMessage = 'Zone complete!\nReturn to map.';
          messageTimer = 2000;
        } else {
          overworldMessage = 'Gate locked!\nComplete all signs.';
          messageTimer = 2000;
          SFX.blocked();
          R.shake(2, 200);
        }
      }
    }
  }

  // Return to map
  if (isJustPressed('x')) {
    SFX.select();
    stopBGM();
    switchScene('worldmap');
  }
}

function drawOverworld() {
  R.clear(1);

  // Draw webcam background
  if (webcamReady) {
    R.drawWebcamGBC(videoEl, processCanvas, 0.2);
  }

  // Draw grass pattern
  for (let y = 0; y < R.height; y += 16) {
    for (let x = 0; x < R.width; x += 16) {
      if ((x + y) % 32 === 0) {
        R.rect(x + 2, y + 2, 2, 2, 2);
      }
    }
  }

  // Draw trees as decoration
  const treePositions = [[4, 30], [4, 70], [150, 50], [150, 90], [8, 8], [140, 8]];
  treePositions.forEach(([tx, ty]) => {
    R.sprite(TREE, tx, ty, 1);
  });

  // Draw gate
  overworldGates.forEach(gate => {
    R.sprite(gate.open ? [] : GATE_LOCKED, gate.x - 4, gate.y, 2);
    if (!gate.open) {
      R.rect(gate.x - 12, gate.y, 24, 10, 0);
      R.rect(gate.x - 12, gate.y + 1, 24, 8, 1);
      R.textColor('▓▓▓', gate.x - 8, gate.y + 2, '#886622', 6);
    } else {
      R.textColor('EXIT', gate.x - 8, gate.y + 2, '#88c070', 6);
    }
  });

  // Find the next target NPC (first uncompleted active NPC)
  const nextTargetIdx = overworldNPCs.findIndex(npc => !npc.completed && npc.active);

  // Draw NPCs
  overworldNPCs.forEach((npc, i) => {
    const bounce = Math.sin(walkTimer / 300 + i) * 2;
    const isNear = (i === currentNPCIndex);
    const isNextTarget = (i === nextTargetIdx);

    // Pulsing beacon for next target NPC (visible from anywhere)
    if (isNextTarget && !npc.completed) {
      const pulseRadius = 14 + Math.sin(walkTimer / 150) * 4;
      const pulseAlpha = 0.3 + Math.sin(walkTimer / 200) * 0.2;
      // Outer glow ring
      R.ctx.strokeStyle = '#ebcb8b';
      R.ctx.lineWidth = R.scale * 2;
      R.ctx.globalAlpha = pulseAlpha;
      R.ctx.beginPath();
      R.ctx.arc(R.px(npc.x), R.px(npc.y), R.px(pulseRadius), 0, Math.PI * 2);
      R.ctx.stroke();
      R.ctx.globalAlpha = 1;

      // Small arrow indicator above the NPC
      const arrowBob = Math.sin(walkTimer / 180) * 3;
      R.textColor('\u25BC', npc.x - 2, npc.y - 20 + arrowBob, '#ebcb8b', 6);
    }

    // Highlight ring when player is nearby
    if (isNear) {
      const pulse = 0.5 + Math.sin(walkTimer / 200) * 0.3;
      R.ctx.strokeStyle = npc.active ? '#e0f8d0' : '#666666';
      R.ctx.lineWidth = R.scale;
      R.ctx.globalAlpha = pulse;
      R.ctx.beginPath();
      R.ctx.arc(R.px(npc.x), R.px(npc.y), R.px(12), 0, Math.PI * 2);
      R.ctx.stroke();
      R.ctx.globalAlpha = 1;
    }

    // Flash effect for next target NPC sprite
    if (isNextTarget && !npc.completed) {
      const flashOn = Math.floor(walkTimer / 500) % 3 !== 0; // on 2/3 of the time
      if (flashOn) {
        R.sprite(NPC_SENSEI, npc.x - 4, npc.y - 4 + bounce, 1);
      } else {
        R.sprite(NPC_SENSEI, npc.x - 4, npc.y - 4 + bounce, 3); // brighter palette
      }
    } else {
      R.sprite(NPC_SENSEI, npc.x - 4, npc.y - 4 + bounce, 1);
    }

    // Letter label above NPC
    if (npc.completed) {
      R.textColor('\u2713', npc.x - 1, npc.y - 12 + bounce, '#88c070', 8);
    } else if (npc.active) {
      R.textColor(npc.letter, npc.x - 2, npc.y - 12 + bounce, '#e0f8d0', 8);
    } else {
      R.textColor('?', npc.x - 1, npc.y - 12 + bounce, '#666666', 8);
    }

    // "Press A" prompt when close
    if (isNear && !overworldMessage) {
      const promptBounce = Math.sin(walkTimer / 250) * 2;
      R.textColor('[Z] TALK', npc.x, npc.y + 12 + promptBounce, '#e0f8d0', 5, 'center');
    }
  });

  // Draw player
  const pSprite = playerDir === 'up' ? PLAYER_UP :
                  playerDir === 'down' ? PLAYER_DOWN :
                  playerDir === 'left' ? PLAYER_LEFT : PLAYER_RIGHT;
  R.sprite(pSprite, playerX - 4, playerY - 5, 1);

  // Zone title bar
  const zone = State.getCurrentZone();
  R.rect(0, 0, R.width, 12, 0);
  R.text(zone.name.toUpperCase(), R.width / 2, 2, 3, 8, 'center');

  // Hearts
  R.hearts(4, R.height - 12, State.getState().hearts, State.getState().maxHearts);

  // Dynamic hint bar at bottom
  const allNPCsDone = overworldNPCs.every(npc => npc.completed);
  const nextNPC = overworldNPCs.find(npc => !npc.completed && npc.active);
  const hintPulse = Math.floor(walkTimer / 600) % 2;

  R.rect(0, R.height - 20, R.width, 8, 0);
  if (allNPCsDone && overworldGates[0]) {
    // All signs done - direct to gate
    if (hintPulse) {
      R.textColor('ALL SIGNS DONE \u2192 GO TO GATE', R.width / 2, R.height - 19, '#ebcb8b', 6, 'center');
    } else {
      R.textColor('ALL SIGNS DONE \u2192 GO TO GATE', R.width / 2, R.height - 19, '#88c070', 6, 'center');
    }
  } else if (nextNPC) {
    // Show which NPC to talk to
    const hintColor = hintPulse ? '#ebcb8b' : '#e0f8d0';
    R.textColor(`TALK TO '${nextNPC.letter}' \u2192 Z`, R.width / 2, R.height - 19, hintColor, 6, 'center');
  }

  // Controls hint
  R.text('X:MAP', R.width - 4, R.height - 8, 1, 6, 'right');

  // Message box
  if (overworldMessage) {
    R.rect(8, R.height - 48, R.width - 16, 32, 0);
    R.rect(10, R.height - 46, R.width - 20, 28, 1);
    R.text(overworldMessage, 16, R.height - 42, 3, 6);
  }

  R.drawFlash();
}

// ─── Scene: Battle (Sign Challenge) ───────────────────
let battleLetter = '';
let battlePhase = 'intro'; // intro, demo, attempt, success, fail
let battleTimer = 0;
let holdTimer = 0;
const HOLD_REQUIRED = 1500; // ms to hold sign
let battleNpcIndex = -1;
let attemptTimeout = 15000; // 15 seconds to attempt
let demoTextIndex = 0;
let demoTextTimer = 0;

function initBattle() {
  battleLetter = sceneData.letter || 'L';
  battleNpcIndex = sceneData.npcIndex ?? -1;
  battlePhase = 'intro';
  battleTimer = 0;
  holdTimer = 0;
  demoTextIndex = 0;
  demoTextTimer = 0;
  playBGM('battle');
}

function updateBattle(dt) {
  battleTimer += dt;

  switch (battlePhase) {
    case 'intro':
      // Typewriter effect for intro text
      demoTextTimer += dt;
      if (demoTextTimer > 40) {
        demoTextTimer = 0;
        demoTextIndex++;
        SFX.text();
      }
      if (isJustPressed('z') || isJustPressed('Enter') || battleTimer > 3000) {
        battlePhase = 'demo';
        battleTimer = 0;
        demoTextIndex = 0;
        demoTextTimer = 0;
      }
      break;

    case 'demo':
      // Show the sign demonstration
      demoTextTimer += dt;
      if (demoTextTimer > 50) {
        demoTextTimer = 0;
        demoTextIndex++;
        SFX.text();
      }
      if ((isJustPressed('z') || isJustPressed('Enter')) && battleTimer > 1000) {
        battlePhase = 'attempt';
        battleTimer = 0;
        holdTimer = 0;
      }
      break;

    case 'attempt':
      // Check for correct sign
      if (handDetected && currentLandmarks) {
        if (detectSign(currentLandmarks, battleLetter)) {
          holdTimer += dt;
          if (holdTimer % 200 < 20) SFX.tick();
          if (holdTimer >= HOLD_REQUIRED) {
            battlePhase = 'success';
            battleTimer = 0;
            SFX.success();
            R.flash('#88c070', 300);
            State.completeSign(battleLetter);
            State.recordAttempt();
            State.advanceChallenge();
          }
        } else {
          holdTimer = Math.max(0, holdTimer - dt * 0.5); // decay slowly
        }
      } else {
        holdTimer = Math.max(0, holdTimer - dt * 0.3);
      }

      // Timeout
      if (battleTimer > attemptTimeout) {
        battlePhase = 'fail';
        battleTimer = 0;
        State.recordAttempt();
        const remaining = State.loseHeart();
        SFX.heartLost();
        R.shake(4, 400);
        R.flash('#e05050', 200);
        if (remaining <= 0) {
          setTimeout(() => {
            State.restoreHearts();
            stopBGM();
            switchScene('gameover');
          }, 1500);
        }
      }
      break;

    case 'success':
      if (battleTimer > 2500 || isJustPressed('z') || isJustPressed('Enter')) {
        stopBGM();
        // Check if all signs in zone are now complete
        const zone = State.getCurrentZone();
        const allDone = zone.letters.every(l => State.getState().completedSigns.includes(l));
        if (allDone && !State.isZoneComplete(zone.id)) {
          // Earn badge and go to zone complete screen
          State.earnBadge(zone.id);
          SFX.badge();
          switchScene('zonecomplete', { zone });
        } else {
          switchScene('challengecomplete', { letter: battleLetter, npcIndex: battleNpcIndex });
        }
      }
      break;

    case 'fail':
      if (battleTimer > 2000 || isJustPressed('z') || isJustPressed('Enter')) {
        if (State.getState().hearts > 0) {
          battlePhase = 'attempt';
          battleTimer = 0;
          holdTimer = 0;
        }
      }
      break;
  }
}

function drawBattle() {
  R.clear(0);

  // Draw webcam feed during attempt
  if (battlePhase === 'attempt' || battlePhase === 'success') {
    if (webcamReady) {
      R.drawWebcamGBC(videoEl, processCanvas, 0.4);
    }
    // Draw hand landmarks
    if (currentLandmarks && handDetected) {
      R.drawHandLandmarks(currentLandmarks, battlePhase === 'success' ? '#ffff00' : '#88c070');
    }
  }

  // Battle frame
  R.rect(0, 0, R.width, 16, 1);
  R.text(`SIGN: '${battleLetter}'`, R.width / 2, 4, 3, 8, 'center');

  // Hearts display
  R.hearts(R.width - 34, 4, State.getState().hearts, State.getState().maxHearts);

  switch (battlePhase) {
    case 'intro': {
      // NPC appears
      R.rect(20, 30, R.width - 40, 84, 1);
      R.rect(22, 32, R.width - 44, 80, 0);

      // NPC sprite
      R.sprite(NPC_SENSEI, 30, 40, 2);

      // Typewriter text
      const fullText = `Sensei says:\nShow me the\nsign for '${battleLetter}'!`;
      const visibleText = fullText.substring(0, demoTextIndex);
      R.text(visibleText, 56, 42, 3, 6);

      if (battleTimer > 1000) {
        R.text('A:CONTINUE', R.width / 2, 104, 2, 6, 'center');
      }
      break;
    }

    case 'demo': {
      // Show how to make the sign — full screen demo with high-fidelity hand art
      R.rect(4, 18, R.width - 8, R.height - 22, 1);
      R.rect(6, 20, R.width - 12, R.height - 26, 0);

      R.text(`SIGN '${battleLetter}'`, R.width / 2, 24, 3, 8, 'center');

      // Draw real ASL reference image (public domain SVG from Wikimedia Commons)
      const signImg = signImages[battleLetter];
      if (signImg && signImg.complete) {
        const imgSize = 180; // logical pixels
        const px = R.scale;
        const drawW = imgSize * px;
        const drawH = imgSize * px;
        const drawX = (R.canvas.width - drawW) / 2;
        const drawY = R.px(36);
        // White background behind the hand image for clarity
        R.ctx.fillStyle = '#e0f8d0';
        R.ctx.fillRect(drawX - 4, drawY - 4, drawW + 8, drawH + 8);
        R.ctx.strokeStyle = '#346856';
        R.ctx.lineWidth = 2;
        R.ctx.strokeRect(drawX - 4, drawY - 4, drawW + 8, drawH + 8);
        R.ctx.drawImage(signImg, drawX, drawY, drawW, drawH);
      }

      // Orientation labels below the image
      R.textColor(getHandSide(battleLetter), R.width / 2, 100, '#ebcb8b', 5, 'center');
      R.textColor(getOrientation(battleLetter), R.width / 2, 107, '#ebcb8b', 5, 'center');

      // Sign description with typewriter
      const desc = SIGN_DESCRIPTIONS[battleLetter] || 'Make the sign!';
      const visibleDesc = desc.substring(0, demoTextIndex);
      R.text(visibleDesc, 12, 112, 2, 6);

      if (battleTimer > 1500) {
        R.text('A:GO!', R.width - 8, R.height - 10, 3, 6, 'right');
      }
      break;
    }

    case 'attempt': {
      // Progress bar for hold
      const progress = holdTimer / HOLD_REQUIRED;
      R.rect(10, R.height - 28, R.width - 20, 10, 0);
      R.progressBar(11, R.height - 27, R.width - 22, 8, progress, 1, progress > 0.8 ? 3 : 2);

      // Timer bar
      const timeLeft = 1 - (battleTimer / attemptTimeout);
      R.rect(10, R.height - 16, R.width - 20, 4, 0);
      R.rect(11, R.height - 15, Math.floor((R.width - 22) * timeLeft), 2, timeLeft > 0.3 ? 2 : 3);

      // Status text
      R.rect(0, R.height - 42, R.width, 12, 0);
      if (!handDetected) {
        R.textColor('SHOW YOUR HAND!', R.width / 2, R.height - 40, '#e05050', 8, 'center');
      } else if (holdTimer > 0) {
        R.textColor('HOLD IT...', R.width / 2, R.height - 40, '#ebcb8b', 8, 'center');
      } else {
        R.text(`SIGN '${battleLetter}' NOW!`, R.width / 2, R.height - 40, 3, 8, 'center');
      }

      // Ghost hand hint — real SVG reference, semi-transparent and pulsing
      const ghostImg = signImages[battleLetter];
      if (ghostImg && ghostImg.complete) {
        const ghostAlpha = 0.25 + Math.sin(battleTimer / 400) * 0.1;
        const px = R.scale;
        const gSize = 120 * px;
        const gx = (R.canvas.width - gSize) / 2;
        const gy = R.px(10);
        R.ctx.globalAlpha = ghostAlpha;
        R.ctx.drawImage(ghostImg, gx, gy, gSize, gSize);
        R.ctx.globalAlpha = 1;
      }

      // Orientation reminder
      R.textColor(getOrientation(battleLetter), R.width / 2, 4, '#ebcb8b', 5, 'center');
      break;
    }

    case 'success': {
      R.rect(20, 40, R.width - 40, 60, 1);
      R.rect(22, 42, R.width - 44, 56, 0);

      const bounce = Math.sin(battleTimer / 150) * 3;
      R.textColor('CORRECT!', R.width / 2, 50 + bounce, '#88c070', 12, 'center');
      R.text(`'${battleLetter}' MASTERED!`, R.width / 2, 72, 3, 8, 'center');

      if (battleTimer > 1000) {
        R.text('A:CONTINUE', R.width / 2, 88, 2, 6, 'center');
      }
      break;
    }

    case 'fail': {
      R.rect(20, 40, R.width - 40, 60, 1);
      R.rect(22, 42, R.width - 44, 56, 0);
      R.textColor('TIME UP!', R.width / 2, 50, '#e05050', 12, 'center');
      R.text('TRY AGAIN...', R.width / 2, 72, 2, 8, 'center');
      R.hearts(R.width / 2 - 15, 84, State.getState().hearts, State.getState().maxHearts);
      break;
    }
  }

  R.drawFlash();
}

// ─── Scene: Challenge Complete ─────────────────────────
let ccTimer = 0;
let ccLetter = '';
let ccNpcIndex = -1;

function initChallengeComplete() {
  ccTimer = 0;
  ccLetter = sceneData.letter || '?';
  ccNpcIndex = sceneData.npcIndex ?? -1;
  SFX.levelClear();
}

function updateChallengeComplete(dt) {
  ccTimer += dt;

  if (ccTimer > 1000) {
    // Z = NEXT challenge (auto-navigate to next NPC)
    if (isJustPressed('z') || isJustPressed('Enter')) {
      SFX.select();
      stopBGM();
      switchScene('overworld', { autoAdvance: true });
    }
    // X = back to world MAP
    if (isJustPressed('x')) {
      SFX.select();
      stopBGM();
      switchScene('worldmap');
    }
  }
}

function drawChallengeComplete() {
  R.clear(0);

  // Border
  R.rect(6, 6, R.width - 12, R.height - 12, 1);
  R.rect(8, 8, R.width - 16, R.height - 16, 0);

  const bounce = Math.sin(ccTimer / 180) * 3;

  // Title
  R.textColor('CHALLENGE', R.width / 2, 18 + bounce, '#88c070', 10, 'center');
  R.textColor('COMPLETE!', R.width / 2, 34 + bounce, '#88c070', 10, 'center');

  // Show the mastered letter big
  R.rect(R.width / 2 - 16, 50, 32, 32, 1);
  R.rect(R.width / 2 - 14, 52, 28, 28, 0);
  R.textColor(ccLetter, R.width / 2, 56, '#ebcb8b', 20, 'center');

  // Checkmark
  R.textColor('MASTERED', R.width / 2, 88, '#88c070', 7, 'center');

  // Navigation options
  if (ccTimer > 1000) {
    const pulse = Math.floor(ccTimer / 400) % 2;
    // NEXT option (highlighted/pulsing)
    if (pulse) {
      R.textColor('Z: NEXT  \u2192', R.width / 2, 106, '#e0f8d0', 8, 'center');
    } else {
      R.text('Z: NEXT  \u2192', R.width / 2, 106, 3, 8, 'center');
    }
    R.text('X: MAP', R.width / 2, 120, 1, 7, 'center');
  }
}

// ─── Scene: Zone Complete ──────────────────────────────
let zcTimer = 0;
let zcZone = null;

function initZoneComplete() {
  zcTimer = 0;
  zcZone = sceneData.zone;
  SFX.levelClear();
}

function updateZoneComplete(dt) {
  zcTimer += dt;
  // Auto-transition to world map after 5 seconds, or press Z
  if (zcTimer > 2500 && (isJustPressed('z') || isJustPressed('Enter'))) {
    switchScene('worldmap');
  }
  if (zcTimer > 6000) {
    switchScene('worldmap');
  }
}

function drawZoneComplete() {
  R.clear(0);

  // Double border for emphasis
  R.rect(2, 2, R.width - 4, R.height - 4, 2);
  R.rect(4, 4, R.width - 8, R.height - 8, 1);
  R.rect(6, 6, R.width - 12, R.height - 12, 0);

  const bounce = Math.sin(zcTimer / 200) * 4;
  const flash = Math.floor(zcTimer / 300) % 2;

  // Title with alternating colors
  if (flash) {
    R.textColor('ZONE', R.width / 2, 16, '#ebcb8b', 12, 'center');
    R.textColor('COMPLETE!', R.width / 2, 32, '#ebcb8b', 12, 'center');
  } else {
    R.textColor('ZONE', R.width / 2, 16, '#e0f8d0', 12, 'center');
    R.textColor('COMPLETE!', R.width / 2, 32, '#e0f8d0', 12, 'center');
  }

  if (zcZone) {
    // Badge icon
    R.sprite(BADGE_ICON, R.width / 2 - 7, 50 + bounce, 3);

    // Badge name and zone name
    R.textColor(zcZone.badge, R.width / 2, 78, zcZone.badgeColor, 8, 'center');
    R.text(zcZone.name, R.width / 2, 92, 2, 7, 'center');

    // Show all mastered letters
    const letters = zcZone.letters;
    const startX = R.width / 2 - (letters.length * 12) / 2;
    letters.forEach((l, i) => {
      R.textColor(l, startX + i * 12 + 4, 104, '#88c070', 8);
    });
    R.textColor('\u2713 \u2713 \u2713', R.width / 2, 114, '#88c070', 6, 'center');
  }

  if (zcTimer > 2500) {
    R.text('A:CONTINUE', R.width / 2, 130, 2, 6, 'center');
  }
}

// ─── Scene: Badge Earned ───────────────────────────────
let badgeTimer = 0;
let badgeZone = null;

function initBadge() {
  badgeTimer = 0;
  badgeZone = sceneData.zone;
  SFX.levelClear();
}

function updateBadge(dt) {
  badgeTimer += dt;
  if (badgeTimer > 2000 && (isJustPressed('z') || isJustPressed('Enter'))) {
    switchScene('worldmap');
  }
}

function drawBadge() {
  R.clear(0);
  R.rect(10, 10, R.width - 20, R.height - 20, 1);
  R.rect(12, 12, R.width - 24, R.height - 24, 0);

  const bounce = Math.sin(badgeTimer / 200) * 4;

  R.textColor('BADGE EARNED!', R.width / 2, 24, '#ebcb8b', 10, 'center');

  if (badgeZone) {
    // Draw badge icon big
    R.sprite(BADGE_ICON, R.width / 2 - 7, 46 + bounce, 3);

    R.textColor(badgeZone.badge, R.width / 2, 76, badgeZone.badgeColor, 8, 'center');
    R.text(badgeZone.name, R.width / 2, 92, 2, 7, 'center');
    R.text('COMPLETE!', R.width / 2, 104, 3, 8, 'center');
  }

  if (badgeTimer > 2000) {
    R.text('A:CONTINUE', R.width / 2, 124, 2, 6, 'center');
  }
}

// ─── Scene: Profile ────────────────────────────────────
function initProfile() {}

function updateProfile(dt) {
  if (isJustPressed('x') || isJustPressed('z') || isJustPressed('Enter') || isJustPressed('Escape')) {
    SFX.select();
    switchScene('worldmap');
  }
}

function drawProfile() {
  R.clear(0);
  R.rect(4, 4, R.width - 8, R.height - 8, 1);
  R.rect(6, 6, R.width - 12, R.height - 12, 0);

  R.text('TRAINER CARD', R.width / 2, 10, 3, 8, 'center');

  // Player sprite
  R.sprite(PLAYER_DOWN, 14, 26, 2);

  const s = State.getState();
  R.text(s.playerName, 40, 28, 3, 8);
  R.text(`Signs: ${s.completedSigns.length}/${getDetectableLetters().length}`, 40, 42, 2, 6);
  R.text(`Accuracy: ${State.getAccuracy()}%`, 40, 52, 2, 6);

  // Badges
  R.text('BADGES:', 10, 68, 3, 7);
  R.rect(8, 78, R.width - 16, 44, 1);
  R.rect(10, 80, R.width - 20, 40, 0);

  ZONES.forEach((zone, i) => {
    const earned = State.isZoneComplete(zone.id);
    const x = 18 + i * 36;
    const y = 86;
    if (earned) {
      R.sprite(BADGE_ICON, x, y, 2);
      R.textColor(zone.badge.split(' ')[0].substring(0, 4), x - 2, y + 18, zone.badgeColor, 5);
    } else {
      R.rect(x, y, 14, 14, 1);
      R.text('?', x + 3, y + 3, 1, 8);
    }
  });

  R.text('B:BACK', R.width / 2, R.height - 16, 1, 6, 'center');
}

// ─── Scene: Game Over ──────────────────────────────────
let gameOverTimer = 0;

function initGameOver() {
  gameOverTimer = 0;
  SFX.gameOver();
}

function updateGameOver(dt) {
  gameOverTimer += dt;
  if (gameOverTimer > 2000 && (isJustPressed('z') || isJustPressed('Enter'))) {
    State.restoreHearts();
    switchScene('overworld');
  }
}

function drawGameOver() {
  R.clear(0);

  const flicker = Math.floor(gameOverTimer / 300) % 2;
  R.textColor('GAME OVER', R.width / 2, 40, flicker ? '#e05050' : '#880000', 14, 'center');

  R.text('You ran out of\nhearts...', R.width / 2, 70, 2, 7, 'center');

  // Show respawn at checkpoint
  R.sprite(CHECKPOINT, R.width / 2 - 4, 92, 2);

  if (gameOverTimer > 2000) {
    R.text('A:TRY AGAIN', R.width / 2, 120, 3, 8, 'center');
  }
}

// ─── Scene Registry ────────────────────────────────────
const sceneInits = {
  title: initTitle,
  worldmap: initWorldMap,
  overworld: initOverworld,
  battle: initBattle,
  challengecomplete: initChallengeComplete,
  zonecomplete: initZoneComplete,
  badge: initBadge,
  profile: initProfile,
  gameover: initGameOver,
};

const sceneUpdates = {
  title: updateTitle,
  worldmap: updateWorldMap,
  overworld: updateOverworld,
  battle: updateBattle,
  challengecomplete: updateChallengeComplete,
  zonecomplete: updateZoneComplete,
  badge: updateBadge,
  profile: updateProfile,
  gameover: updateGameOver,
};

const sceneDraws = {
  title: drawTitle,
  worldmap: drawWorldMap,
  overworld: drawOverworld,
  battle: drawBattle,
  challengecomplete: drawChallengeComplete,
  zonecomplete: drawZoneComplete,
  badge: drawBadge,
  profile: drawProfile,
  gameover: drawGameOver,
};

// ─── Main Loop ─────────────────────────────────────────
let lastTime = 0;

function gameLoop(time) {
  const dt = Math.min(time - lastTime, 50); // cap delta
  lastTime = time;

  // Handle transitions (clean state machine)
  if (transitionPhase !== 'none') {
    transitionTimer += dt;

    if (transitionPhase === 'closing') {
      // Iris closing over current scene
      const p = Math.min(transitionTimer / TRANSITION_DURATION, 1);
      if (sceneDraws[currentScene]) sceneDraws[currentScene]();
      R.irisWipe(p, false);
      if (p >= 1) {
        transitionPhase = 'black';
        transitionTimer = 0;
        finishTransition();
      }
    } else if (transitionPhase === 'black') {
      // Brief hold on black
      R.clear(0);
      if (transitionTimer >= TRANSITION_PAUSE) {
        transitionPhase = 'opening';
        transitionTimer = 0;
      }
    } else if (transitionPhase === 'opening') {
      // Iris opening over new scene
      const p = Math.min(transitionTimer / TRANSITION_DURATION, 1);
      if (sceneDraws[currentScene]) sceneDraws[currentScene]();
      R.irisWipe(1 - p, false);
      if (p >= 1) {
        transitionPhase = 'none';
      }
    }

    clearJustPressed();
    requestAnimationFrame(gameLoop);
    return;
  }

  // Apply effects
  R.ctx.save();
  R.applyEffects(dt);

  // Update and draw current scene
  if (sceneUpdates[currentScene]) sceneUpdates[currentScene](dt);
  if (sceneDraws[currentScene]) sceneDraws[currentScene]();

  R.ctx.restore();

  // Draw webcam feed to side panel display
  updateWebcamDisplay();

  clearJustPressed();
  requestAnimationFrame(gameLoop);
}

function updateWebcamDisplay() {
  if (!webcamDisplayCtx || !videoEl || videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return;
  const w = webcamDisplay.width;
  const h = webcamDisplay.height;

  // Mirror the video horizontally so it feels natural
  webcamDisplayCtx.save();
  webcamDisplayCtx.translate(w, 0);
  webcamDisplayCtx.scale(-1, 1);
  webcamDisplayCtx.drawImage(videoEl, 0, 0, w, h);
  webcamDisplayCtx.restore();

  // Apply GBC palette effect
  const imgData = webcamDisplayCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const gbcColors = [
    [8, 24, 32],     // darkest
    [52, 104, 86],   // dark
    [136, 192, 112], // light
    [224, 248, 208], // lightest
  ];
  // Pixelate by sampling every 2 pixels
  for (let py = 0; py < h; py += 2) {
    for (let px = 0; px < w; px += 2) {
      const i = (py * w + px) * 4;
      const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
      let ci;
      if (gray > 190) ci = 3;
      else if (gray > 120) ci = 2;
      else if (gray > 60) ci = 1;
      else ci = 0;
      const c = gbcColors[ci];
      // Fill 2x2 block
      for (let dy = 0; dy < 2 && py+dy < h; dy++) {
        for (let dx = 0; dx < 2 && px+dx < w; dx++) {
          const j = ((py+dy) * w + (px+dx)) * 4;
          data[j] = c[0]; data[j+1] = c[1]; data[j+2] = c[2];
        }
      }
    }
  }
  webcamDisplayCtx.putImageData(imgData, 0, 0);

  // Draw hand skeleton overlay if detected
  if (handDetected && currentLandmarks) {
    webcamDisplayCtx.save();
    // Mirror landmarks too
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];
    webcamDisplayCtx.strokeStyle = '#88c070';
    webcamDisplayCtx.lineWidth = 2;
    connections.forEach(([a, b]) => {
      const la = currentLandmarks[a];
      const lb = currentLandmarks[b];
      webcamDisplayCtx.beginPath();
      webcamDisplayCtx.moveTo((1 - la.x) * w, la.y * h);
      webcamDisplayCtx.lineTo((1 - lb.x) * w, lb.y * h);
      webcamDisplayCtx.stroke();
    });
    webcamDisplayCtx.fillStyle = '#e0f8d0';
    currentLandmarks.forEach(lm => {
      webcamDisplayCtx.fillRect((1 - lm.x) * w - 2, lm.y * h - 2, 4, 4);
    });
    webcamDisplayCtx.restore();
  }
}

// ─── Init ──────────────────────────────────────────────
State.loadState();
initTitle();
initWebcam();
initTouchControls();
initResponsiveCanvas();
requestAnimationFrame(gameLoop);

