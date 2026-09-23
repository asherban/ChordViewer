import { Ajv } from 'ajv';
import schema from './lead-sheet-v1.schema.json' with { type: 'json' };
import schemaV2 from './lead-sheet-v2.schema.json' with { type: 'json' };
import { measureTicks, type KeySignature, type TimeSignature } from './music.js';
export { KEY_SIGNATURES, SUPPORTED_KEYS, keyAccidentals, keyLabel, measureTicks, changeScoreSettings } from './music.js';
export type { KeySignature, TimeSignature } from './music.js';
export type { AccountSummary, SheetSummary, SavedSheet, NewSheetRequest, SaveSheetRequest, ImportSheetRequest } from './library.js';
export { CHORD_DURATIONS, ChordEntryError, ChordCapture, insertChord, replaceChord, deleteChord, findChord, recognizeChord } from './chord-entry.js';
export type { ChordDuration, ChordPosition, ChordEdit, LocatedChord, ChordEntryIssue, ChordCandidate, ChordRecognition } from './chord-entry.js';
export { MELODY_DURATIONS, MelodyEntryError, midiToPitch, insertMelody, replaceMelody, deleteMelody, findMelody, setMelodyTie } from './melody-entry.js';
export { practiceEvents, practiceBar, firstPracticeEventInBar, supportsPracticeMatch,
  matchesPracticeChord, transposePracticeScore } from './practice.js';
export { PracticeSession } from './practice.js';
export type { MelodyPosition, MelodySpec, MelodyEdit, LocatedMelody, MelodyEntryIssue } from './melody-entry.js';

export const scoreSchema = schema;
export const scoreSchemaV2 = schemaV2;
export const TICKS_PER_QUARTER = 480;
export const TICKS_PER_MEASURE = 1920;

export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  alter: -1 | 0 | 1;
  octave: 3 | 4 | 5 | 6;
}
export interface NoteDuration { denominator: 1 | 2 | 4 | 8 | 16; dots: 0 | 1 }
export interface ChordEvent { id: string; offsetTicks: number; durationTicks: number; symbol: string }
interface MelodyBase { id: string; offsetTicks: number; duration: NoteDuration }
export interface NoteEvent extends MelodyBase { kind: 'note'; pitch: Pitch; tieToNext?: boolean }
export interface RestEvent extends MelodyBase { kind: 'rest' }
export type MelodyEvent = NoteEvent | RestEvent;
export interface Measure { id: string; chords: ChordEvent[]; melody: MelodyEvent[] }
export interface LeadSheet {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  keySignature: KeySignature;
  timeSignature: TimeSignature;
  ticksPerQuarter: 480;
  measures: Measure[];
}
export type ScoreIssueCode = 'schema' | 'duplicate-id' | 'event-order' | 'event-overlap' | 'event-out-of-bar' | 'invalid-tie';
export interface ScoreIssue { code: ScoreIssueCode; path: string; message: string }
export class ScoreValidationError extends Error {
  readonly issues: ScoreIssue[];
  constructor(issues: ScoreIssue[]) {
    super('The lead sheet does not conform to its supported score version.');
    this.name = 'ScoreValidationError';
    this.issues = issues;
  }
}

// Validate rather than normalize: every client must see the same original score and spelling.
const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validateShape = ajv.compile<LeadSheet>(scoreSchema);
const validateShapeV2 = ajv.compile<LeadSheet>(scoreSchemaV2);

export function durationTicks(duration: NoteDuration): number {
  return (TICKS_PER_MEASURE / duration.denominator) * (duration.dots === 1 ? 1.5 : 1);
}
function samePitch(left: Pitch, right: Pitch): boolean {
  return left.step === right.step && left.alter === right.alter && left.octave === right.octave;
}

/** Throws on invalid input; never coerces, reorders, strips fields or changes pitch spelling. */
export function parseScore(value: unknown): LeadSheet {
  const validate = typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion === 2 ? validateShapeV2 : validateShape;
  if (!validate(value)) {
    throw new ScoreValidationError((validate.errors ?? []).map(error => ({
      code: 'schema', path: error.instancePath || '/', message: error.message ?? 'Invalid score field.',
    })));
  }
  const issues: ScoreIssue[] = [];
  const barTicks = measureTicks(value);
  const ids = new Set<string>();
  const addId = (id: string, path: string): void => {
    if (ids.has(id)) issues.push({ code: 'duplicate-id', path, message: 'IDs must be unique throughout the sheet.' });
    ids.add(id);
  };
  addId(value.id, '/id');
  const voice: { event: MelodyEvent; start: number; end: number; path: string }[] = [];
  for (const [measureIndex, measure] of value.measures.entries()) {
    const measurePath = `/measures/${measureIndex}`;
    addId(measure.id, `${measurePath}/id`);
    for (const lane of ['chords', 'melody'] as const) {
      let previousStart = -1;
      let previousEnd = 0;
      for (const [eventIndex, event] of measure[lane].entries()) {
        const path = `${measurePath}/${lane}/${eventIndex}`;
        const length = 'durationTicks' in event ? event.durationTicks : durationTicks(event.duration);
        const end = event.offsetTicks + length;
        addId(event.id, `${path}/id`);
        if (event.offsetTicks < previousStart) issues.push({ code: 'event-order', path, message: 'Events must be ordered by offset.' });
        if (event.offsetTicks < previousEnd) issues.push({ code: 'event-overlap', path, message: 'Events in one lane must not overlap.' });
        if (end > barTicks) issues.push({ code: 'event-out-of-bar', path, message: 'Events must end inside their measure.' });
        previousStart = event.offsetTicks;
        previousEnd = Math.max(previousEnd, end);
        if ('kind' in event) voice.push({ event, start: measureIndex * barTicks + event.offsetTicks,
          end: measureIndex * barTicks + end, path });
      }
    }
  }
  for (const [index, item] of voice.entries()) {
    if (item.event.kind !== 'note' || !item.event.tieToNext) continue;
    const next = voice[index + 1];
    if (!next || next.event.kind !== 'note' || item.end !== next.start || !samePitch(item.event.pitch, next.event.pitch)) {
      issues.push({ code: 'invalid-tie', path: `${item.path}/tieToNext`, message: 'A tie requires an adjacent following note with the same spelled pitch.' });
    }
  }
  if (issues.length > 0) throw new ScoreValidationError(issues);
  return value;
}
