// Chiptune audio engine using Web Audio API
// Generates 8-bit square wave sounds like a real GameBoy

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

// Background music engine - simple looping chiptune
let bgmInterval = null;
let bgmPlaying = false;

const BGM_PATTERNS = {
  overworld: {
    melody: [
      392, 440, 523, 440, 392, 330, 392, 440,
      523, 587, 659, 587, 523, 440, 392, 330,
      262, 330, 392, 440, 523, 440, 392, 330,
      294, 349, 440, 523, 494, 440, 392, 349,
    ],
    bass: [
      131, 131, 165, 165, 196, 196, 165, 165,
      175, 175, 220, 220, 196, 196, 165, 165,
      131, 131, 165, 165, 196, 196, 220, 220,
      147, 147, 175, 175, 196, 196, 175, 175,
    ],
    tempo: 220
  },
  battle: {
    melody: [
      523, 0, 523, 659, 784, 0, 659, 523,
      587, 0, 587, 698, 784, 0, 698, 587,
      659, 0, 784, 880, 1047, 0, 880, 784,
      523, 659, 784, 659, 523, 440, 392, 330,
    ],
    bass: [
      131, 0, 131, 165, 196, 0, 165, 131,
      147, 0, 147, 175, 196, 0, 175, 147,
      165, 0, 196, 220, 262, 0, 220, 196,
      131, 165, 196, 165, 131, 110, 98, 82,
    ],
    tempo: 160
  },
  title: {
    melody: [
      523, 0, 659, 0, 784, 0, 1047, 0,
      880, 0, 784, 0, 659, 0, 523, 0,
      440, 0, 523, 0, 659, 0, 784, 0,
      659, 0, 523, 0, 440, 0, 392, 0,
    ],
    bass: [
      131, 0, 165, 0, 196, 0, 262, 0,
      220, 0, 196, 0, 165, 0, 131, 0,
      110, 0, 131, 0, 165, 0, 196, 0,
      165, 0, 131, 0, 110, 0, 98, 0,
    ],
    tempo: 280
  }
};

export function playBGM(pattern = 'overworld') {
  stopBGM();
  const p = BGM_PATTERNS[pattern];
  if (!p) return;
  let step = 0;
  bgmPlaying = true;
  bgmInterval = setInterval(() => {
    if (!bgmPlaying) return;
    const melodyNote = p.melody[step % p.melody.length];
    const bassNote = p.bass[step % p.bass.length];
    if (melodyNote > 0) playNote(melodyNote, p.tempo / 1000 * 0.8, 'square', 0.04);
    if (bassNote > 0) playNote(bassNote, p.tempo / 1000 * 0.8, 'triangle', 0.03);
    step++;
  }, p.tempo);
}

export function stopBGM() {
  bgmPlaying = false;
  if (bgmInterval) clearInterval(bgmInterval);
  bgmInterval = null;
}
