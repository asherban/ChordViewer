import { durationTicks, parseScore, type LeadSheet, type MelodyEvent, type NoteDuration, type Pitch } from './index.js';
import { KEY_SIGNATURES, keyAccidentals, measureTicks, removeInvalidMelodyTies, sameSpelledPitch, type KeySignature } from './music.js';
import type { ChordPosition } from './chord-entry.js';

export const MELODY_DURATIONS: readonly NoteDuration[] = [
  { denominator: 1, dots: 0 }, { denominator: 1, dots: 1 }, { denominator: 2, dots: 0 }, { denominator: 2, dots: 1 },
  { denominator: 4, dots: 0 }, { denominator: 4, dots: 1 }, { denominator: 8, dots: 0 },
  { denominator: 8, dots: 1 }, { denominator: 16, dots: 0 }, { denominator: 16, dots: 1 },
];
export type MelodyPosition = ChordPosition;
export type MelodySpec = { kind: 'note'; pitch: Pitch; duration: NoteDuration } | { kind: 'rest'; duration: NoteDuration };
export interface MelodyEdit { score: LeadSheet; position: MelodyPosition; eventId: string }
export interface LocatedMelody { event: MelodyEvent; position: MelodyPosition }
export type MelodyEntryIssue = 'position' | 'duration' | 'pitch' | 'kind' | 'occupied' | 'barline' | 'limit' | 'missing' | 'id' | 'tie';
export class MelodyEntryError extends Error {
  constructor(readonly code: MelodyEntryIssue, message: string) { super(message); this.name = 'MelodyEntryError'; }
}

function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validateSpec(spec: MelodySpec): void {
  if (!spec || (spec.kind !== 'note' && spec.kind !== 'rest')
    || !hasKeys(spec, spec.kind === 'note' ? ['kind', 'duration', 'pitch'] : ['kind', 'duration'])) {
    throw new MelodyEntryError('kind', 'Choose a single melody note or a rest.');
  }
  if (!hasKeys(spec.duration, ['denominator', 'dots']) || ![1, 2, 4, 8, 16].includes(spec.duration.denominator)
    || ![0, 1].includes(spec.duration.dots)) throw new MelodyEntryError('duration', 'Choose a whole, half, quarter, eighth or sixteenth note, with at most one dot.');
  if (spec.kind === 'note' && (!hasKeys(spec.pitch, ['step', 'alter', 'octave']) || !['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(spec.pitch.step)
    || ![-1, 0, 1].includes(spec.pitch.alter) || ![3, 4, 5, 6].includes(spec.pitch.octave))) {
    throw new MelodyEntryError('pitch', 'Choose a pitch from C3 through B6, with a natural, sharp or flat.');
  }
}

/** Prefers diatonic spelling, then the key's accidental family; never transposes a MIDI pitch. */
export function midiToPitch(midi: number, key: KeySignature = 'C'): Pitch {
  if (!Number.isInteger(midi) || midi < 48 || midi > 95) throw new MelodyEntryError('pitch', 'Melody entry supports C3 through B6. Play a note in that range or change its octave.');
  if (!Object.hasOwn(KEY_SIGNATURES, key)) throw new MelodyEntryError('pitch', 'Choose a supported major or minor key.');
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  const alterations = keyAccidentals(key);
  for (const step of Object.keys(natural) as Pitch['step'][]) {
    const alter = alterations[step];
    const octave = (midi - natural[step] - alter) / 12 - 1;
    if (Number.isInteger(octave) && octave >= 3 && octave <= 6) return { step, alter, octave: octave as Pitch['octave'] };
  }
  const sharpSteps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const;
  const flatSteps = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'] as const;
  const step = (KEY_SIGNATURES[key].fifths < 0 ? flatSteps : sharpSteps)[midi % 12]!;
  return { step, alter: (midi % 12 - natural[step]) as Pitch['alter'], octave: (Math.floor(midi / 12) - 1) as Pitch['octave'] };
}

export function findMelody(score: LeadSheet, eventId: string): LocatedMelody | null {
  for (const [measureIndex, measure] of score.measures.entries()) {
    const event = measure.melody.find(item => item.id === eventId);
    if (event) return { event, position: { measureIndex, offsetTicks: event.offsetTicks } };
  }
  return null;
}
function requireMelody(score: LeadSheet, eventId: string): LocatedMelody {
  const found = findMelody(score, eventId);
  if (!found) throw new MelodyEntryError('missing', 'This melody note or rest no longer exists. Select another position.');
  return found;
}
function checkSpace(score: LeadSheet, position: MelodyPosition, ticks: number, replacedId?: string): void {
  const bar = measureTicks(score);
  if (!Number.isInteger(position.measureIndex) || position.measureIndex < 0 || position.measureIndex > score.measures.length
    || !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= bar) {
    throw new MelodyEntryError('position', 'Select a position in the sheet or its next bar.');
  }
  if (position.offsetTicks + ticks > bar) throw new MelodyEntryError('barline', 'This duration crosses the barline. Choose a shorter duration or another position.');
  if (score.measures[position.measureIndex]?.melody.some(event => event.id !== replacedId
    && event.offsetTicks < position.offsetTicks + ticks && event.offsetTicks + durationTicks(event.duration) > position.offsetTicks)) {
    throw new MelodyEntryError('occupied', 'A melody note or rest occupies this time. Select it to replace it, or choose an empty position.');
  }
}
function advance(score: LeadSheet, position: MelodyPosition, ticks: number): MelodyPosition {
  return position.offsetTicks + ticks === measureTicks(score) ? { measureIndex: position.measureIndex + 1, offsetTicks: 0 }
    : { measureIndex: position.measureIndex, offsetTicks: position.offsetTicks + ticks };
}
function eventFrom(spec: MelodySpec, id: string, offsetTicks: number): MelodyEvent {
  return spec.kind === 'rest' ? { id, kind: 'rest', offsetTicks, duration: { ...spec.duration } }
    : { id, kind: 'note', offsetTicks, duration: { ...spec.duration }, pitch: { ...spec.pitch } };
}

/** Uses free melody space only. IDs are requested for the event, then its new bar if needed. */
export function insertMelody(score: LeadSheet, position: MelodyPosition, spec: MelodySpec, idFactory: () => string): MelodyEdit {
  parseScore(score); validateSpec(spec);
  const ticks = durationTicks(spec.duration);
  checkSpace(score, position, ticks);
  if (position.measureIndex === score.measures.length && score.measures.length >= 256) throw new MelodyEntryError('limit', 'This sheet has reached the 256-bar limit.');
  if ((score.measures[position.measureIndex]?.melody.length ?? 0) >= 64) throw new MelodyEntryError('limit', 'This bar has reached its 64 melody-event limit.');
  const used = new Set([score.id, ...score.measures.flatMap(measure => [measure.id, ...measure.chords.map(event => event.id), ...measure.melody.map(event => event.id)])]);
  const newId = () => {
    const id = idFactory();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(id) || used.has(id)) throw new MelodyEntryError('id', 'A new melody event or bar must have a unique valid ID.');
    used.add(id); return id;
  };
  const eventId = newId();
  const event = eventFrom(spec, eventId, position.offsetTicks);
  const measures = [...score.measures];
  if (position.measureIndex === measures.length) measures.push({ id: newId(), chords: [], melody: [event] });
  else {
    const measure = measures[position.measureIndex]!;
    measures[position.measureIndex] = { ...measure, melody: [...measure.melody, event].sort((left, right) => left.offsetTicks - right.offsetTicks) };
  }
  return { score: parseScore({ ...score, measures }), position: advance(score, position, ticks), eventId };
}

/** Replaces the selected event in place, preserving its identity and any still-valid ties. */
export function replaceMelody(score: LeadSheet, eventId: string, spec: MelodySpec): MelodyEdit {
  parseScore(score); validateSpec(spec);
  const found = requireMelody(score, eventId);
  const ticks = durationTicks(spec.duration);
  checkSpace(score, found.position, ticks, eventId);
  const event = eventFrom(spec, eventId, found.position.offsetTicks);
  if (event.kind === 'note' && found.event.kind === 'note' && found.event.tieToNext !== undefined) event.tieToNext = found.event.tieToNext;
  const changed = { ...score, measures: score.measures.map((measure, index) => index !== found.position.measureIndex ? measure
    : { ...measure, melody: measure.melody.map(item => item.id === eventId ? event : item) }) };
  return { score: parseScore(removeInvalidMelodyTies(changed)), position: advance(score, found.position, ticks), eventId };
}

/** Erases pitch, retaining its rest, duration, position and identity so later events do not move. */
export function deleteMelody(score: LeadSheet, eventId: string): LeadSheet {
  parseScore(score);
  const { event } = requireMelody(score, eventId);
  return replaceMelody(score, eventId, { kind: 'rest', duration: event.duration }).score;
}

export function setMelodyTie(score: LeadSheet, eventId: string, enabled: boolean): LeadSheet {
  parseScore(score);
  const found = requireMelody(score, eventId);
  if (typeof enabled !== 'boolean') throw new MelodyEntryError('tie', 'Choose whether to tie this note to the next note.');
  if (enabled) {
    const voice = score.measures.flatMap((measure, index) => measure.melody.map(event => ({ event, start: index * measureTicks(score) + event.offsetTicks })));
    const index = voice.findIndex(item => item.event.id === eventId);
    const next = voice[index + 1];
    if (found.event.kind !== 'note' || !next || next.event.kind !== 'note'
      || voice[index]!.start + durationTicks(found.event.duration) !== next.start || !sameSpelledPitch(found.event.pitch, next.event.pitch)) {
      throw new MelodyEntryError('tie', 'A tie needs an immediately following note with the same pitch spelling. Add or correct that note first.');
    }
  }
  return parseScore({ ...score, measures: score.measures.map((measure, index) => index !== found.position.measureIndex ? measure
    : { ...measure, melody: measure.melody.map(event => {
      if (event.id !== eventId || event.kind !== 'note') return event;
      const copy = { ...event }; if (enabled) copy.tieToNext = true; else delete copy.tieToNext; return copy;
    }) }) });
}
