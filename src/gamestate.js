// Game state management for Signal Quest

import { ZONES } from './signs.js';

const SAVE_KEY = 'signalquest_save';

function createDefaultState() {
  return {
    currentZone: 0,
    currentChallenge: 0,
    hearts: 3,
    maxHearts: 3,
    badges: [],
    completedSigns: [],
    totalCorrect: 0,
    totalAttempts: 0,
    playerName: 'PLAYER',
    unlockedZones: [0], // zone indices
  };
}

let state = createDefaultState();

export function getState() {
  return state;
}

export function resetState() {
  state = createDefaultState();
  saveState();
}

export function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // silently fail
  }
}

export function loadState() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      state = { ...createDefaultState(), ...JSON.parse(saved) };
    }
  } catch (e) {
    state = createDefaultState();
  }
}

export function loseHeart() {
  state.hearts = Math.max(0, state.hearts - 1);
  saveState();
  return state.hearts;
}

export function restoreHearts() {
  state.hearts = state.maxHearts;
  saveState();
}

export function completeSign(letter) {
  if (!state.completedSigns.includes(letter)) {
    state.completedSigns.push(letter);
  }
  state.totalCorrect++;
  saveState();
}

export function recordAttempt() {
  state.totalAttempts++;
}

export function earnBadge(zoneId) {
  const zone = ZONES.find(z => z.id === zoneId);
  if (zone && !state.badges.includes(zoneId)) {
    state.badges.push(zoneId);
    // Unlock next zone
    const zoneIndex = ZONES.findIndex(z => z.id === zoneId);
    if (zoneIndex + 1 < ZONES.length && !state.unlockedZones.includes(zoneIndex + 1)) {
      state.unlockedZones.push(zoneIndex + 1);
    }
    saveState();
    return zone;
  }
  return null;
}

export function isZoneUnlocked(zoneIndex) {
  return state.unlockedZones.includes(zoneIndex);
}

export function isZoneComplete(zoneId) {
  return state.badges.includes(zoneId);
}

export function getCurrentZone() {
  return ZONES[state.currentZone] || ZONES[0];
}

export function setCurrentZone(index) {
  state.currentZone = index;
  state.currentChallenge = 0;
  saveState();
}

export function advanceChallenge() {
  state.currentChallenge++;
  saveState();
}

export function getAccuracy() {
  if (state.totalAttempts === 0) return 0;
  return Math.floor((state.totalCorrect / state.totalAttempts) * 100);
}
