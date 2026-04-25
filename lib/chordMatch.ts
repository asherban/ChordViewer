// Normalise a canonical chord name for comparison.
// Converts ASCII accidentals and common suffix variants so that e.g.
// "Cm7" ≡ "Cmin7", "Bb7" ≡ "Bb7", "F#m7b5" ≡ "F#m7b5".
export function normalizeChord(name: string): string {
  if (!name) return '';
  return name
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/min(?!or)/g, 'm')
    .replace(/maj/gi, 'maj')
    .toLowerCase()
    .trim();
}

// Check whether a detected chord matches the expected canonical chord from the chart.
// Comparison is done on normalised forms, ignoring case and accidental glyph variants.
// Slash chords: if the expected chord has no bass note, the bass in the detected chord
// is ignored (we only require the top chord matches). If the expected chord has a bass
// note, we require an exact normalised match.
export function matchesExpected(expected: string | null, detected: string | null): boolean {
  if (!expected || !detected) return false;

  const normExpected = normalizeChord(expected);
  const normDetected = normalizeChord(detected);

  if (normExpected === normDetected) return true;

  // If expected has no slash, ignore any bass in detected
  if (!expected.includes('/')) {
    const detectedTop = normDetected.split('/')[0];
    return normExpected === detectedTop;
  }

  return false;
}
