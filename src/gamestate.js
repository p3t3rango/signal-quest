// Duolingo-style game state — streaks, XP, lesson progress, spaced repetition

const SAVE_KEY = 'signalquest_save';
const SCHEMA_VERSION = 2;

// Lesson curriculum
export const LESSONS = [
  { id: 1, name: 'Basics I',   subtitle: 'Fist & Palm',   signs: ['A', 'B', 'C'], xp: 15 },
  { id: 2, name: 'Basics II',  subtitle: 'Point & Curl',  signs: ['D', 'F', 'I'], xp: 15 },
  { id: 3, name: 'Shapes',     subtitle: 'Thumb Work',    signs: ['K', 'L', 'O'], xp: 20 },
  { id: 4, name: 'Angles',     subtitle: 'Cross & Pair',  signs: ['R', 'U', 'V'], xp: 20 },
  { id: 5, name: 'Spread',     subtitle: 'Wide Signs',    signs: ['W', 'Y'],      xp: 25 },
];

function createDefault() {
  return {
    completedLessons: [],   // lesson ids
    masteredSigns: [],      // letters
    hearts: 3,
    maxHearts: 3,
    streak: 0,
    lastPlayDate: null,     // ISO date string
    xp: 0,
    badges: [],             // lesson ids that earned badges
    bestStars: {},          // { lessonId: 1-3 } best star rating per lesson
    checkpointsPassed: [],  // lesson ids whose review checkpoint was cleared
    quizStats: {},          // { letter: { seen, correct } } receptive accuracy
    // { letter: { seen, correct, lastSeen: epochMs, halfLifeDays } }
    // Memory strength per sign. Deliberately separate from masteredSigns,
    // which stays a permanent "have I ever learned this" set for the map and
    // the signs-mastered count.
    signStrength: {},
    // 'right' | 'left' — which hand the learner signs with. Affects presentation
    // only: the detectors are handedness-invariant (verified by mirroring
    // landmarks), but the reference art is all right hands and has to be
    // flipped the correct way to match a mirrored camera.
    handedness: 'right',
    schemaVersion: SCHEMA_VERSION,
  };
}

let state = createDefault();

export function getState() { return state; }

export function resetState() {
  state = createDefault();
  saveState();
}

export function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
}

export function loadState() {
  let raw = null;
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) raw = JSON.parse(saved);
  } catch (e) { raw = null; }

  if (!raw) { state = createDefault(); return; }
  state = { ...createDefault(), ...raw };

  // Saves written before checkpoints existed have completedLessons but no
  // checkpointsPassed; gating on the new key alone would drop those players
  // back to lesson 1. Grandfather them ONCE, keyed off the absent schema
  // version — re-running this every load would let a reload skip any
  // checkpoint the player hasn't cleared yet.
  if (raw.schemaVersion === undefined) {
    state.checkpointsPassed = [...state.completedLessons];
  }
  // v2 seeds memory strength for signs learned before it existed. lastSeen is
  // set to now rather than backdated: we don't know when they were practised,
  // and guessing old would dump everything into review on first launch.
  if ((raw.schemaVersion ?? 0) < 2) {
    const now = Date.now();
    for (const letter of state.masteredSigns) {
      if (!state.signStrength[letter]) {
        state.signStrength[letter] = { seen: 1, correct: 1, lastSeen: now, halfLifeDays: 1 };
      }
    }
  }
  if ((raw.schemaVersion ?? 0) < SCHEMA_VERSION) {
    state.schemaVersion = SCHEMA_VERSION;
    saveState();
  }
}

// ─── Hearts ───
export function loseHeart() {
  state.hearts = Math.max(0, state.hearts - 1);
  saveState();
  return state.hearts;
}

export function restoreHearts() {
  state.hearts = state.maxHearts;
  saveState();
}

export function hasHearts() { return state.hearts > 0; }

// ─── Streak ───
export function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastPlayDate === today) return; // already counted today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.lastPlayDate === yesterday) {
    state.streak++;
  } else if (state.lastPlayDate !== today) {
    state.streak = 1; // reset streak
  }
  state.lastPlayDate = today;
  saveState();
}

// ─── XP ───
export function addXP(amount) {
  state.xp += amount;
  saveState();
}

// ─── Lessons ───
export function isLessonComplete(lessonId) {
  return state.completedLessons.includes(lessonId);
}

export function isLessonUnlocked(lessonId) {
  if (lessonId === 1) return true;
  // Finishing the previous lesson isn't enough — its review checkpoint has to
  // be cleared too, so signs are retained rather than just seen once.
  return state.completedLessons.includes(lessonId - 1)
      && state.checkpointsPassed.includes(lessonId - 1);
}

// ─── Checkpoints & receptive practice ───
export function isCheckpointPassed(lessonId) {
  return state.checkpointsPassed.includes(lessonId);
}

export function passCheckpoint(lessonId) {
  if (!state.checkpointsPassed.includes(lessonId)) {
    state.checkpointsPassed.push(lessonId);
  }
  saveState();
}

export function recordQuizAnswer(letter, correct) {
  const s = state.quizStats[letter] || { seen: 0, correct: 0 };
  s.seen++;
  if (correct) s.correct++;
  state.quizStats[letter] = s;
  saveState();
}

// ─── Handedness ───
export function getHandedness() { return state.handedness === 'left' ? 'left' : 'right'; }

export function toggleHandedness() {
  state.handedness = getHandedness() === 'right' ? 'left' : 'right';
  saveState();
  return state.handedness;
}

// ─── Memory strength (spaced repetition) ───
// A simplified half-life model, after Duolingo's half-life regression: recall
// decays exponentially, and each answer scales the half-life rather than
// setting a fixed next-review date. Getting something right pushes it further
// out; getting it wrong pulls it sharply back in.
const DAY_MS = 86400000;
const INITIAL_HALF_LIFE = 0.5;   // days — a brand new sign comes back the same day
const MIN_HALF_LIFE = 0.2;
const MAX_HALF_LIFE = 60;
const DUE_THRESHOLD = 0.7;       // predicted recall below this counts as due

export function recordPractice(letter, correct) {
  const s = state.signStrength[letter]
    || { seen: 0, correct: 0, lastSeen: 0, halfLifeDays: INITIAL_HALF_LIFE };
  s.seen++;
  if (correct) {
    s.correct++;
    s.halfLifeDays = Math.min(MAX_HALF_LIFE, s.halfLifeDays * 2);
  } else {
    // Lapses cost more than successes gain — a missed sign should come back soon
    s.halfLifeDays = Math.max(MIN_HALF_LIFE, s.halfLifeDays * 0.4);
  }
  s.lastSeen = Date.now();
  state.signStrength[letter] = s;
  saveState();
}

// Predicted chance of recalling this sign right now, 0..1.
export function recallProbability(letter, now = Date.now()) {
  const s = state.signStrength[letter];
  if (!s) return 0;
  const days = (now - s.lastSeen) / DAY_MS;
  return Math.pow(2, -days / s.halfLifeDays);
}

// Learned signs whose predicted recall has decayed, weakest first.
export function getDueSigns(now = Date.now()) {
  return getLearnedSigns()
    .map(letter => ({ letter, recall: recallProbability(letter, now) }))
    .filter(x => x.recall < DUE_THRESHOLD)
    .sort((a, b) => a.recall - b.recall)
    .map(x => x.letter);
}

export function getDueCount(now = Date.now()) {
  return getDueSigns(now).length;
}

// A lesson that's been completed but whose checkpoint hasn't been cleared yet.
// Home routes here instead of into the next (still locked) lesson.
export function getPendingCheckpointId() {
  for (const lesson of LESSONS) {
    if (state.completedLessons.includes(lesson.id) && !state.checkpointsPassed.includes(lesson.id)) {
      return lesson.id;
    }
  }
  return null;
}

// Every sign taught by a lesson the player has completed.
export function getLearnedSigns() {
  const out = [];
  for (const lesson of LESSONS) {
    if (state.completedLessons.includes(lesson.id)) {
      for (const s of lesson.signs) if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

export function completeLesson(lessonId, stars) {
  if (!state.completedLessons.includes(lessonId)) {
    state.completedLessons.push(lessonId);
  }
  // Track best stars
  const prev = state.bestStars[lessonId] || 0;
  if (stars > prev) state.bestStars[lessonId] = stars;
  saveState();
}

export function masterSign(letter) {
  if (!state.masteredSigns.includes(letter)) {
    state.masteredSigns.push(letter);
  }
  saveState();
}

export function getNextLessonId() {
  for (const lesson of LESSONS) {
    if (!state.completedLessons.includes(lesson.id)) return lesson.id;
  }
  return null; // all done
}

export function getLesson(id) {
  return LESSONS.find(l => l.id === id);
}

export function getTotalSigns() {
  return state.masteredSigns.length;
}

export function getTotalLessons() {
  return LESSONS.length;
}
