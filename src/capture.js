// Landmark capture — dev tool, not part of the game.
//
// The sign detectors were written by reasoning about hand geometry and never
// checked against real hands, which is how B ended up rejecting a correct sign
// for months. This records MediaPipe landmarks from actual people so the
// detectors can be regression-tested instead of argued about.
//
// Not reachable from the game and not in the production build: Vite only
// bundles index.html, so capture.html exists in dev and preview only.

import { detectSign, getDetectableLetters, getHandDebugInfo } from './signs.js';

const LETTERS = getDetectableLetters();
const videoEl = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const verdictEl = document.getElementById('verdict');
const lettersEl = document.getElementById('letters');
const logEl = document.getElementById('log');
const captureBtn = document.getElementById('capture');
const downloadBtn = document.getElementById('download');
const undoBtn = document.getElementById('undo');
const clearBtn = document.getElementById('clear');

const STORE_KEY = 'signalquest_capture';
let selected = LETTERS[0];
let landmarks = null;
let samples = load();

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
}
function persist() {
  // Survives a reload mid-session — capturing 14 letters takes a while and
  // losing it to an accidental refresh would be miserable.
  try { localStorage.setItem(STORE_KEY, JSON.stringify(samples)); } catch (e) { /* full */ }
}

// ─── Letter picker ───
const buttons = {};
LETTERS.forEach(letter => {
  const b = document.createElement('button');
  b.append(letter);
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = '0';
  b.appendChild(n);
  b.onclick = () => { selected = letter; render(); };
  buttons[letter] = b;
  lettersEl.appendChild(b);
});

function countFor(letter) { return samples.filter(s => s.letter === letter).length; }

function render() {
  LETTERS.forEach(l => {
    buttons[l].className = l === selected ? 'sel' : '';
    buttons[l].querySelector('.n').textContent = countFor(l);
  });
  const total = samples.length;
  downloadBtn.disabled = total === 0;
  undoBtn.disabled = total === 0;
  clearBtn.disabled = total === 0;
  logEl.textContent = total
    ? `${total} sample${total === 1 ? '' : 's'} across ${new Set(samples.map(s => s.letter)).size} letters`
    : 'no samples yet';
}

// ─── Capture ───
function capture() {
  if (!landmarks) return;
  samples.push({
    letter: selected,
    // What the detector said at capture time. Lets the fixture file record
    // known-failing poses, not just ones that already pass.
    detectedAtCapture: detectSign(landmarks, selected),
    landmarks: landmarks.map(p => ({
      x: +p.x.toFixed(5), y: +p.y.toFixed(5), z: +p.z.toFixed(5),
    })),
  });
  persist();
  render();
  overlay.style.borderColor = '#e0f8d0';
  setTimeout(() => { overlay.style.borderColor = '#346856'; }, 120);
}

captureBtn.onclick = capture;
document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); capture(); }
  const i = LETTERS.indexOf(e.key.toUpperCase());
  if (i >= 0) { selected = LETTERS[i]; render(); }
});

undoBtn.onclick = () => { samples.pop(); persist(); render(); };
clearBtn.onclick = () => {
  if (confirm(`Delete all ${samples.length} captured samples?`)) {
    samples = []; persist(); render();
  }
};

downloadBtn.onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, samples }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `landmarks-${samples.length}.json`;
  a.click();
  // Revoking immediately can cancel the download on some browsers
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// ─── Camera + MediaPipe ───
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function draw() {
  ctx.save();
  // Mirror, so moving your hand right moves it right on screen
  ctx.translate(overlay.width, 0);
  ctx.scale(-1, 1);
  if (videoEl.readyState >= 2) {
    ctx.drawImage(videoEl, 0, 0, overlay.width, overlay.height);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
  }
  if (landmarks) {
    const px = p => [p.x * overlay.width, p.y * overlay.height];
    ctx.strokeStyle = '#88c070';
    ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(...px(landmarks[a]));
      ctx.lineTo(...px(landmarks[b]));
      ctx.stroke();
    });
    ctx.fillStyle = '#e0f8d0';
    landmarks.forEach(p => {
      const [x, y] = px(p);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.restore();
}

function updateVerdict() {
  if (!landmarks) {
    verdictEl.className = 'wait';
    verdictEl.textContent = 'show your hand';
    captureBtn.disabled = true;
    return;
  }
  captureBtn.disabled = false;
  const hit = detectSign(landmarks, selected);
  const also = getHandDebugInfo(landmarks).matches.filter(l => l !== selected);
  verdictEl.className = hit ? 'ok' : 'no';
  verdictEl.textContent = hit
    ? `'${selected}' DETECTED${also.length ? ` (also ${also.join(' ')})` : ''}`
    : `'${selected}' not detected${also.length ? ` — reads as ${also.join(' ')}` : ''}`;
}

function start() {
  if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
    verdictEl.className = 'no';
    verdictEl.textContent = 'MediaPipe failed to load';
    return;
  }
  const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
  hands.onResults(r => {
    landmarks = r.multiHandLandmarks?.[0] || null;
    draw();
    updateVerdict();
  });
  const cam = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }); },
    width: 480, height: 360,
  });
  Promise.resolve(cam.start()).catch(e => {
    verdictEl.className = 'no';
    verdictEl.textContent = 'camera failed: ' + e.message;
  });
}

render();
start();
