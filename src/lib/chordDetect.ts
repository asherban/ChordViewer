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

  const candidates = detect(pitchClasses);
  const chord = candidates.length > 0 ? candidates[0] : null;

  return { chord, candidates, noteNames };
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
