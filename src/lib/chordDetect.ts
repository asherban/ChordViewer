import { midiToNoteName } from '@tonaljs/midi';
import { detect } from '@tonaljs/chord-detect';

export interface ChordResult {
  /** Best matching chord name, e.g. "Cmaj7", or null if undetermined */
  chord: string | null;
  /** All candidate chord names ranked by likelihood */
  candidates: string[];
  /** Pitch class names of the held notes, e.g. ["C", "Eb", "G"] */
  noteNames: string[];
}

// Pitch class values (0–11) for note names returned by Tonal.js (flats preferred)
const NOTE_PC: Record<string, number> = {
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4,
  'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11,
};

// [interval to 3rd, interval to 7th] → Tonal.js quality suffix
const SEVENTH_SHAPES: [number, number, string][] = [
  [4, 11, 'maj7'],   // major 7th:        root + maj3 + maj7
  [3, 10, 'm7'],     // minor 7th:        root + min3 + min7
  [3, 11, 'm/ma7'],  // minor-major 7th:  root + min3 + maj7
];

/**
 * Given exactly 3 pitch classes (root + 3rd + 7th, no 5th), try to identify
 * which 7th chord they form. Returns the Tonal.js chord name or null.
 */
function detectSeventhNoFifth(pcs: string[]): string | null {
  for (let i = 0; i < pcs.length; i++) {
    const rootPc = NOTE_PC[pcs[i]];
    if (rootPc === undefined) continue;

    const intervals = pcs
      .filter((_, j) => j !== i)
      .map(n => (NOTE_PC[n] - rootPc + 12) % 12)
      .sort((a, b) => a - b);

    for (const [third, seventh, suffix] of SEVENTH_SHAPES) {
      if (intervals[0] === third && intervals[1] === seventh) {
        return pcs[i] + suffix;
      }
    }
  }
  return null;
}

/**
 * Given a Set of currently held MIDI note numbers, returns chord detection results.
 */
export function detectChord(activeNotes: Set<number>): ChordResult {
  if (activeNotes.size === 0) {
    return { chord: null, candidates: [], noteNames: [] };
  }

  // Sort by MIDI number (lowest to highest) before converting
  const sortedMidi = [...activeNotes].sort((a, b) => a - b);

  // Convert MIDI numbers to pitch class strings (no octave, flats preferred)
  const noteNames = sortedMidi.map((n) =>
    midiToNoteName(n, { pitchClass: true, sharps: false })
  );

  if (activeNotes.size === 1) {
    return { chord: null, candidates: [], noteNames };
  }

  // Deduplicate pitch classes (C4 and C5 both become "C")
  const pitchClasses = [...new Set(noteNames)];

  // Strip "no5" suffix: Tonal.js returns e.g. "C7no5" when the fifth is omitted
  let candidates = detect(pitchClasses).map(c =>
    c.endsWith('no5') ? c.slice(0, -3) : c
  );

  // Tonal.js returns nothing for maj7/m7/mMaj7 without the fifth; detect them manually
  if (candidates.length === 0 && pitchClasses.length === 3) {
    const inferred = detectSeventhNoFifth(pitchClasses);
    if (inferred) candidates = [inferred];
  }

  const chord = candidates.length > 0 ? candidates[0] : null;

  // Return deduplicated pitch classes so the note pills never show duplicate
  // or stale entries from React key collisions when the same pitch class
  // appears in multiple octaves (e.g. C3 and C4 both map to "C").
  return { chord, candidates, noteNames: pitchClasses };
}

/**
 * Convert a MIDI note number to a VexFlow key string, e.g. 60 → "c/4", 61 → "db/4"
 */
export function midiToVexKey(midiNumber: number): string {
  const name = midiToNoteName(midiNumber, { sharps: false }); // e.g. "Db4", "C4"
  const match = name.match(/^([A-G])(b|#)?(-?\d+)$/);
  if (!match) return 'c/4';
  const [, letter, acc = '', octave] = match;
  return `${letter.toLowerCase()}${acc}/${octave}`;
}
