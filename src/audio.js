// Chiptune audio engine using Web Audio API
// Generates 8-bit square wave sounds like a real GameBoy

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Browsers create the context suspended until the page sees a user gesture.
    // Without this the first track starts "playing" into silence.
    const resume = () => { if (audioCtx.state === 'suspended') audioCtx.resume(); };
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
      window.addEventListener(ev, resume, { passive: true }));
  }
  return audioCtx;
}

function playNote(freq, duration, type = 'square', volume = 0.12) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playArpeggio(notes, noteLen, type = 'square', volume = 0.12) {
  notes.forEach((freq, i) => {
    setTimeout(() => playNote(freq, noteLen, type, volume), i * noteLen * 800);
  });
}

export const SFX = {
  // Success: C-E-G-C arpeggio (triumphant)
  success() {
    playArpeggio([523, 659, 784, 1047], 0.12, 'square', 0.1);
  },

  // Wrong: descending buzz
  wrong() {
    playNote(200, 0.08, 'square', 0.1);
    setTimeout(() => playNote(150, 0.15, 'square', 0.1), 100);
  },

  // Menu select blip
  select() {
    playNote(880, 0.06, 'square', 0.08);
  },

  // Menu move blip
  move() {
    playNote(440, 0.04, 'square', 0.06);
  },

  // Heart lost
  heartLost() {
    playNote(300, 0.1, 'square', 0.1);
    setTimeout(() => playNote(200, 0.1, 'square', 0.1), 120);
    setTimeout(() => playNote(100, 0.3, 'sawtooth', 0.08), 240);
  },

  // Badge earned fanfare
  badge() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => playNote(freq, 0.18, 'square', 0.1), i * 140);
    });
  },

  // Level clear
  levelClear() {
    const notes = [392, 523, 659, 784, 1047, 1319, 1568];
    notes.forEach((freq, i) => {
      setTimeout(() => playNote(freq, 0.15, 'square', 0.09), i * 100);
    });
  },

  // Gate blocked bounce
  blocked() {
    playNote(120, 0.12, 'square', 0.1);
  },

  // Typing text
  text() {
    playNote(600 + Math.random() * 200, 0.03, 'square', 0.04);
  },

  // Game over
  gameOver() {
    const notes = [400, 350, 300, 250, 200, 150];
    notes.forEach((freq, i) => {
      setTimeout(() => playNote(freq, 0.25, 'square', 0.1), i * 200);
    });
  },

  // Start game
  start() {
    playArpeggio([262, 330, 392, 523, 659, 784], 0.1, 'square', 0.08);
  },

  // Detection progress tick
  tick() {
    playNote(1200, 0.02, 'square', 0.03);
  }
};

// ─── Background music engine ───────────────────────────
// Lofi chiptune: chip waveforms (triangle/square) run through a lowpass and a
// sample-accurate scheduler, so it keeps the 8-bit timbre but breathes.
//
// What makes it read as lofi rather than chiptune:
//   - a shared lowpass rolls the highs off the whole mix
//   - chords are 9ths/maj7ths rather than single melody notes
//   - swing pushes off-beats late; per-note humanize keeps it off the grid
//   - a quiet noise bed sits under everything like tape hiss

const N = {
  A2: 110.00, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
  A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
};

// Per-bar harmony. Steps are eighth notes, 8 per bar.
const BGM_PATTERNS = {
  lofi: {
    stepMs: 400,        // eighths @ 75bpm
    swing: 0.18,        // off-beats land this fraction of a step late
    cutoff: 1250,
    bars: [
      { bass: 'A2', fifth: 'E3', chord: ['C4', 'E4', 'G4', 'B4'], mel: { 2: 'E5', 5: 'C5', 7: 'B4' } },
      { bass: 'D3', fifth: 'A2', chord: ['D4', 'F4', 'A4', 'C5'], mel: { 1: 'D5', 4: 'A4', 6: 'F4' } },
      { bass: 'F3', fifth: 'C3', chord: ['E4', 'F4', 'A4', 'C5'], mel: { 2: 'A4', 5: 'C5' } },
      { bass: 'G3', fifth: 'D3', chord: ['D4', 'F4', 'G4', 'B4'], mel: { 0: 'B4', 3: 'D5', 6: 'G4' } },
    ],
    chordSteps: [0, 3, 6],
    bassSteps: { 0: 'bass', 4: 'bass', 6: 'fifth' },
  },
  // Sparser and darker — for lesson screens, so it stays out of the way.
  lofiFocus: {
    stepMs: 460,
    swing: 0.2,
    cutoff: 900,
    bars: [
      { bass: 'D3', fifth: 'A2', chord: ['D4', 'F4', 'A4', 'C5'], mel: { 4: 'A4' } },
      { bass: 'A2', fifth: 'E3', chord: ['C4', 'E4', 'G4', 'B4'], mel: { 6: 'E5' } },
      { bass: 'F3', fifth: 'C3', chord: ['E4', 'F4', 'A4', 'C5'], mel: { 2: 'C5' } },
      { bass: 'G3', fifth: 'D3', chord: ['D4', 'F4', 'G4', 'B4'], mel: {} },
    ],
    chordSteps: [0, 4],
    bassSteps: { 0: 'bass', 4: 'fifth' },
  },
};

let bgmChain = null;     // gain -> lowpass -> destination
let bgmFilter = null;
let hissSource = null;
let hissGain = null;

// ─── Mute ───
// Music only — sound effects stay audible so buttons still feel responsive.
// Kept in its own storage key rather than the save file: it's a device
// preference, not game progress, and shouldn't travel with a save.
const MUTE_KEY = 'signalquest_muted';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode */ }

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (bgmChain) {
    const ctx = getCtx();
    // Ramp rather than jump, so it doesn't click
    bgmChain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.04);
  }
  return muted;
}

function getBgmChain() {
  const ctx = getCtx();
  if (!bgmChain) {
    bgmFilter = ctx.createBiquadFilter();
    bgmFilter.type = 'lowpass';
    bgmFilter.frequency.value = 1250;
    bgmFilter.Q.value = 0.6;
    bgmChain = ctx.createGain();
    bgmChain.gain.value = muted ? 0 : 1;
    bgmChain.connect(bgmFilter);
    bgmFilter.connect(ctx.destination);
  }
  return bgmChain;
}

// One scheduled note. Times are absolute AudioContext seconds, not setTimeout.
function voice(freq, startAt, dur, opts = {}) {
  const ctx = getCtx();
  const { type = 'sine', volume = 0.05, detune = 0, attack = 0.012 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(getBgmChain());
  osc.start(startAt);
  osc.stop(startAt + dur + 0.03);
}

// Tape hiss bed — looping white noise, very quiet.
function startHiss() {
  const ctx = getCtx();
  if (hissSource) return;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
  hissSource = ctx.createBufferSource();
  hissSource.buffer = buf;
  hissSource.loop = true;
  hissGain = ctx.createGain();
  hissGain.gain.value = 0.012;
  hissSource.connect(hissGain);
  hissGain.connect(getBgmChain());
  hissSource.start();
}

function stopHiss() {
  if (hissSource) { try { hissSource.stop(); } catch (e) { /* already stopped */ } }
  hissSource = null;
  hissGain = null;
}

let bgmTimer = null;
let bgmPlaying = false;
let bgmPattern = null;
let bgmStep = 0;
let bgmNextTime = 0;

const SCHEDULE_AHEAD = 0.25;  // seconds of notes queued in advance
const TICK_MS = 25;

function humanize(ms = 9) { return (Math.random() * 2 - 1) * (ms / 1000); }

function scheduleStep(step, when) {
  const p = bgmPattern;
  const stepSec = p.stepMs / 1000;
  const barIdx = Math.floor(step / 8) % p.bars.length;
  const inBar = step % 8;
  const bar = p.bars[barIdx];

  // Swing: odd (off-beat) eighths land late. The grid itself stays uniform.
  const swung = when + (inBar % 2 === 1 ? p.swing * stepSec : 0);

  // Bass — triangle, the classic chip bass voice
  const bassRole = p.bassSteps[inBar];
  if (bassRole && bar[bassRole]) {
    voice(N[bar[bassRole]], swung + humanize(6), stepSec * 1.7,
      { type: 'triangle', volume: 0.11, attack: 0.02 });
  }

  // Chord pad — two detuned layers so it shimmers instead of sitting flat
  if (p.chordSteps.includes(inBar)) {
    bar.chord.forEach((name, i) => {
      const t = swung + humanize(11) + i * 0.008;  // slight roll, like a strum
      voice(N[name], t, stepSec * 2.4, { type: 'sine', volume: 0.038, attack: 0.05 });
      voice(N[name], t, stepSec * 2.4, { type: 'triangle', volume: 0.022, detune: 7, attack: 0.06 });
    });
  }

  // Melody — square keeps the 8-bit character; the lowpass tames the buzz
  const mel = bar.mel[inBar];
  if (mel) {
    voice(N[mel], swung + humanize(12), stepSec * 1.3,
      { type: 'square', volume: 0.045, attack: 0.015 });
  }
}

function bgmTick() {
  if (!bgmPlaying || !bgmPattern) return;
  const ctx = getCtx();
  const stepSec = bgmPattern.stepMs / 1000;
  while (bgmNextTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(bgmStep, bgmNextTime);
    bgmStep++;
    bgmNextTime += stepSec;
  }
}

export function playBGM(pattern = 'lofi') {
  // Older scenes ask for chiptune names that no longer exist; fall back rather
  // than silently playing nothing.
  const p = BGM_PATTERNS[pattern] || BGM_PATTERNS.lofi;
  // Bouncing home -> map -> home shouldn't restart the same track mid-phrase.
  if (bgmPlaying && bgmPattern === p) return;
  stopBGM();
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  bgmPattern = p;
  bgmPlaying = true;
  bgmStep = 0;
  bgmNextTime = ctx.currentTime + 0.1;
  getBgmChain();
  bgmFilter.frequency.setTargetAtTime(p.cutoff, ctx.currentTime, 0.3);
  startHiss();
  bgmTick();
  bgmTimer = setInterval(bgmTick, TICK_MS);
}

export function stopBGM() {
  bgmPlaying = false;
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  bgmPattern = null;
  stopHiss();
}

// ─── Stingers ──────────────────────────────────────────
// A short one-shot phrase instead of a loop. Plays through the BGM bus, so the
// mute toggle silences it too — it's music, not a UI sound effect.
//
// lessonComplete is a ii-V-I turnaround in C (Dm9 -> G9 -> Cmaj9) under a
// rising melody, which is about the most satisfying two seconds in tonal music.
const STINGERS = {
  lessonComplete: {
    cutoff: 2400,   // open the filter up — this one should feel bright
    bass: [{ at: 0.00, n: 'D3' }, { at: 0.42, n: 'G3' }, { at: 0.92, n: 'C3' }],
    steps: [
      { at: 0.00, chord: ['D4', 'F4', 'A4', 'C5'], mel: 'A4' },
      { at: 0.24, mel: 'C5' },
      { at: 0.42, chord: ['G3', 'B3', 'F4', 'A4'], mel: 'D5' },
      { at: 0.66, mel: 'E5' },
      { at: 0.92, chord: ['C4', 'E4', 'G4', 'B4', 'D5'], mel: 'G5' },
    ],
  },
};

export function playStinger(name = 'lessonComplete') {
  const s = STINGERS[name];
  if (!s) return;
  stopBGM();                      // the loop would muddy it
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
  getBgmChain();
  bgmFilter.frequency.setTargetAtTime(s.cutoff, ctx.currentTime, 0.05);

  const t0 = ctx.currentTime + 0.06;
  s.bass.forEach(b =>
    voice(N[b.n], t0 + b.at, 1.7, { type: 'triangle', volume: 0.12, attack: 0.02 }));
  s.steps.forEach(st => {
    if (st.chord) st.chord.forEach((nm, i) => {
      const t = t0 + st.at + i * 0.014;   // slight roll, like a strum
      voice(N[nm], t, 1.6, { type: 'sine', volume: 0.05, attack: 0.02 });
      voice(N[nm], t, 1.6, { type: 'triangle', volume: 0.028, detune: 6, attack: 0.03 });
    });
    if (st.mel) voice(N[st.mel], t0 + st.at, 0.55, { type: 'square', volume: 0.055, attack: 0.008 });
  });
}
