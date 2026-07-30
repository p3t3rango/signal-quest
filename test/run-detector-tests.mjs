// Detector regression suite.
//
// Loads every fixture in test/fixtures/ and checks each captured hand against
// the detector for the letter it was labelled with. Run: npm run test:signs
//
// Capture fixtures with the dev tool: npm run dev, then open /capture.html
//
// Two kinds of failure are reported:
//   MISS  — a real hand signing X that the X detector rejects. These are the
//           ones that make the game feel broken, and the reason this exists.
//   AMBIG — a hand signing X that also satisfies some other letter's detector.
//           Not a bug on its own (the game only ever tests the target letter)
//           but it shows where two detectors overlap.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectSign, getDetectableLetters } from '../src/signs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const LETTERS = getDetectableLetters();

function loadSamples() {
  if (!existsSync(FIXTURES)) return [];
  const out = [];
  for (const f of readdirSync(FIXTURES).filter(n => n.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));
    } catch (e) {
      console.error(`  ${f}: not valid JSON — ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    for (const s of parsed.samples || []) {
      if (!s.letter || !Array.isArray(s.landmarks) || s.landmarks.length !== 21) {
        console.error(`  ${f}: skipping malformed sample (need letter + 21 landmarks)`);
        continue;
      }
      out.push({ ...s, file: f });
    }
  }
  return out;
}

const samples = loadSamples();

if (samples.length === 0) {
  console.log('\nNo fixtures yet.\n');
  console.log('  1. npm run dev');
  console.log('  2. open http://localhost:5173/capture.html');
  console.log('  3. capture a few samples per letter, download the JSON');
  console.log(`  4. save it into test/fixtures/ and re-run\n`);
  console.log('Until then the detectors are unverified against real hands.\n');
  process.exit(0);
}

const byLetter = new Map();
for (const s of samples) {
  if (!byLetter.has(s.letter)) byLetter.set(s.letter, []);
  byLetter.get(s.letter).push(s);
}

let pass = 0;
const misses = [];
const ambiguous = [];

for (const letter of LETTERS) {
  const group = byLetter.get(letter) || [];
  if (group.length === 0) continue;
  let hit = 0;
  for (const s of group) {
    const ok = detectSign(s.landmarks, letter);
    if (ok) { hit++; pass++; } else { misses.push({ letter, file: s.file }); }
    const others = LETTERS.filter(l => l !== letter && detectSign(s.landmarks, l));
    if (others.length) ambiguous.push({ letter, others });
  }
  const rate = Math.round((hit / group.length) * 100);
  const bar = rate === 100 ? '  OK ' : rate >= 60 ? ' WARN' : ' FAIL';
  console.log(`${bar}  ${letter}  ${String(hit).padStart(3)}/${String(group.length).padEnd(3)} ${rate}%`);
}

const untested = LETTERS.filter(l => !byLetter.has(l));

console.log('');
console.log(`${pass}/${samples.length} samples detected (${Math.round((pass / samples.length) * 100)}%)`);

if (untested.length) {
  console.log(`\nNo fixtures for: ${untested.join(' ')}`);
  console.log('These letters are still unverified against real hands.');
}

if (ambiguous.length) {
  const seen = new Map();
  for (const a of ambiguous) {
    const key = a.letter + ' -> ' + a.others.join(',');
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  console.log('\nAMBIG (also matches another detector):');
  for (const [k, n] of seen) console.log(`  ${k}  x${n}`);
}

if (misses.length) {
  const seen = new Map();
  for (const m of misses) seen.set(m.letter, (seen.get(m.letter) || 0) + 1);
  console.log('\nMISS (real sign rejected by its own detector):');
  for (const [l, n] of seen) console.log(`  ${l}  x${n}`);
  console.log('');
  process.exit(1);
}

console.log('\nAll captured signs detected.\n');
