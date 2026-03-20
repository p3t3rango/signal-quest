// Duolingo-style game state — streaks, XP, lesson progress, spaced repetition

const SAVE_KEY = 'signalquest_save';

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
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) state = { ...createDefault(), ...JSON.parse(saved) };
  } catch (e) { state = createDefault(); }
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
  return state.completedLessons.includes(lessonId - 1);
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
