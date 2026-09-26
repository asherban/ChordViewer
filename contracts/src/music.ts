import { durationTicks, measureTicks, sameSpelledPitch, type LeadSheet, type MelodyEvent, type Pitch } from './score.js';
import { parseScore } from './validation.js';

export const KEY_SIGNATURES = {
  C: { fifths: 0, mode: 'major' }, G: { fifths: 1, mode: 'major' }, D: { fifths: 2, mode: 'major' },
  A: { fifths: 3, mode: 'major' }, E: { fifths: 4, mode: 'major' }, B: { fifths: 5, mode: 'major' },
  'F#': { fifths: 6, mode: 'major' }, 'C#': { fifths: 7, mode: 'major' }, F: { fifths: -1, mode: 'major' },
  Bb: { fifths: -2, mode: 'major' }, Eb: { fifths: -3, mode: 'major' }, Ab: { fifths: -4, mode: 'major' },
  Db: { fifths: -5, mode: 'major' }, Gb: { fifths: -6, mode: 'major' }, Cb: { fifths: -7, mode: 'major' },
  Am: { fifths: 0, mode: 'minor' }, Em: { fifths: 1, mode: 'minor' }, Bm: { fifths: 2, mode: 'minor' },
  'F#m': { fifths: 3, mode: 'minor' }, 'C#m': { fifths: 4, mode: 'minor' }, 'G#m': { fifths: 5, mode: 'minor' },
  'D#m': { fifths: 6, mode: 'minor' }, 'A#m': { fifths: 7, mode: 'minor' }, Dm: { fifths: -1, mode: 'minor' },
  Gm: { fifths: -2, mode: 'minor' }, Cm: { fifths: -3, mode: 'minor' }, Fm: { fifths: -4, mode: 'minor' },
  Bbm: { fifths: -5, mode: 'minor' }, Ebm: { fifths: -6, mode: 'minor' }, Abm: { fifths: -7, mode: 'minor' },
} as const;
export type KeySignature = keyof typeof KEY_SIGNATURES;
export interface TimeSignature { numerator: number; denominator: 2 | 4 | 8 }
export const SUPPORTED_KEYS: readonly KeySignature[] = Object.keys(KEY_SIGNATURES) as KeySignature[];

export function keyAccidentals(key: KeySignature): Record<Pitch['step'], Pitch['alter']> {
  const definition = KEY_SIGNATURES[key];
  if (!Object.hasOwn(KEY_SIGNATURES, key)) throw new RangeError('Choose a supported major or minor key.');
  const result: Record<Pitch['step'], Pitch['alter']> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const order = definition.fifths < 0 ? 'BEADGCF' : 'FCGDAEB';
  for (const step of order.slice(0, Math.abs(definition.fifths))) result[step as Pitch['step']] = definition.fifths < 0 ? -1 : 1;
  return result;
}
export function keyLabel(key: KeySignature): string {
  const definition = KEY_SIGNATURES[key];
  if (!Object.hasOwn(KEY_SIGNATURES, key)) throw new RangeError('Choose a supported major or minor key.');
  return `${key.replace(/m$/, '').replace('#', '♯').replace('b', '♭')} ${definition.mode}`;
}

/** Repairs only existing ties made invalid by an edit; never creates ties or shifts events. */
export function removeInvalidMelodyTies(score: LeadSheet): LeadSheet {
  const ticks = measureTicks(score);
  const voice = score.measures.flatMap((measure, index) => measure.melody.map(event => ({ event, start: index * ticks + event.offsetTicks })));
  const invalid = new Set<string>();
  voice.forEach(({ event, start }, index) => {
    if (event.kind !== 'note' || !event.tieToNext) return;
    const next = voice[index + 1];
    if (!next || next.event.kind !== 'note' || start + durationTicks(event.duration) !== next.start || !sameSpelledPitch(event.pitch, next.event.pitch)) invalid.add(event.id);
  });
  if (!invalid.size) return score;
  return { ...score, measures: score.measures.map(measure => ({ ...measure, melody: measure.melody.map((event): MelodyEvent => {
    if (event.kind !== 'note' || !invalid.has(event.id)) return event;
    const copy = { ...event }; delete copy.tieToNext; return copy;
  }) })) };
}

/** Changes notation metadata without transposition, reflowing events, or truncating a bar. */
export function changeScoreSettings(score: LeadSheet, keySignature: KeySignature, timeSignature: TimeSignature): LeadSheet {
  parseScore(score);
  if (!SUPPORTED_KEYS.includes(keySignature)) throw new RangeError('Choose a supported major or minor key.');
  if (!Number.isInteger(timeSignature.numerator) || timeSignature.numerator < 1 || timeSignature.numerator > 12 || ![2, 4, 8].includes(timeSignature.denominator)) {
    throw new RangeError('Choose a time signature with 1–12 beats and a denominator of 2, 4 or 8.');
  }
  const changed: LeadSheet = { ...score, schemaVersion: 2, keySignature, timeSignature: { ...timeSignature } };
  const ticks = measureTicks(changed);
  if (score.measures.some(measure => measure.chords.some(event => event.offsetTicks + event.durationTicks > ticks)
    || measure.melody.some(event => event.offsetTicks + durationTicks(event.duration) > ticks))) {
    throw new RangeError('Existing notes or chords would cross the new barline. Shorten or move them before changing the time signature.');
  }
  return parseScore(removeInvalidMelodyTies(changed));
}
