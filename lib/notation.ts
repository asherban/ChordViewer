export type Notation = 'regular' | 'jazz';

/**
 * Ordered map of Tonal.js quality suffixes → jazz equivalents.
 * Longer/more specific entries come first to prevent partial matches.
 */
const QUALITY_MAP: [string, string][] = [
  ['m/ma7',    '-Δ7'],
  ['mMaj7b6',  '-Δ7b6'],
  ['maj7#5',   '+Δ7'],
  ['maj9#11',  'Δ9#11'],
  ['maj9#5',   '+Δ9'],
  ['maj13',    'Δ13'],
  ['maj9',     'Δ9'],
  ['maj7',     'Δ7'],
  ['maj#4',    'Δ#11'],
  ['m7b5',     'ø7'],
  ['dim7',     '°7'],
  ['dim',      '°'],
  ['aug',      '+'],
  ['m7#5',     '-7#5'],
  ['m7',       '-7'],
  ['m9',       '-9'],
  ['m6',       '-6'],
  ['m13',      '-13'],
  ['m11',      '-11'],
  ['m',        '-'],
  ['M7b5',     'Δ7b5'],
  ['M7',       'Δ7'],
  ['M',        ''],   // major triad = root only
];

/**
 * Convert a Tonal.js chord name to jazz notation.
 * e.g. "Cmaj7" → "CΔ7", "F#m7b5" → "F#ø7", "Bb7" → "Bb7"
 * Unrecognised qualities are returned unchanged.
 */
export function toJazzNotation(chordName: string): string {
  const match = chordName.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chordName;
  const [, root, quality] = match;

  for (const [regular, jazz] of QUALITY_MAP) {
    if (quality === regular) return root + jazz;
  }

  return chordName;
}

export function applyNotation(chordName: string, notation: Notation): string {
  return notation === 'jazz' ? toJazzNotation(chordName) : chordName;
}
