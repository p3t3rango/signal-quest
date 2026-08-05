// Words for fingerspelling practice.
//
// Only 14 of the 26 letters are detectable, so the list is hand-picked from
// what's actually spellable: A B C D F I K L O R U V W Y. (The gaps are motion
// letters J/Z, the thumb-hidden fist variants E/M/N/S/T, and the
// sideways-pointing G/H/P/Q.)
//
// Ordered easiest first — short, common, and avoiding letter pairs that are
// visually close, so an early word isn't a detector stress test.
export const WORDS = [
  // 3 letters
  'CAB', 'CAR', 'BAR', 'FAR', 'LAB', 'LID', 'KID', 'BID', 'RIB', 'FIB',
  'COW', 'LOW', 'ROW', 'BOW', 'AID', 'OIL', 'OWL', 'ADD', 'ODD',
  // 4 letters
  'FOIL', 'COIL', 'BOIL', 'CURL', 'CLAW', 'DRAW', 'WORD', 'BIRD', 'CLUB', 'DIAL',
  // 5 letters
  'VIRAL', 'FLUID', 'LUCID',
];

// Words spellable using only the letters the player has actually learned.
export function wordsFor(letters) {
  const known = new Set(letters);
  return WORDS.filter(w => [...w].every(c => known.has(c)));
}

// Shortest first, so word mode opens with something achievable.
export function pickWord(letters, rng = Math.random) {
  const pool = wordsFor(letters);
  if (!pool.length) return null;
  const shortest = Math.min(...pool.map(w => w.length));
  // Bias toward the shorter end rather than always the minimum, so it varies.
  const eligible = pool.filter(w => w.length <= shortest + 1);
  return eligible[Math.floor(rng() * eligible.length)];
}
