import { Ajv } from 'ajv';
import schema from './lead-sheet-v1.schema.json' with { type: 'json' };
export type { AccountSummary, SheetSummary, SavedSheet, NewSheetRequest, SaveSheetRequest } from './library.js';
export { CHORD_DURATIONS, ChordEntryError, ChordCapture, insertChord, replaceChord, deleteChord, findChord, recognizeChord } from './chord-entry.js';
export type { ChordDuration, ChordPosition, ChordEdit, LocatedChord, ChordEntryIssue, ChordCandidate, ChordRecognition } from './chord-entry.js';

export const scoreSchema = schema;
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
  schemaVersion: 1;
  id: string;
  title: string;
  keySignature: 'C';
  timeSignature: { numerator: 4; denominator: 4 };
  ticksPerQuarter: 480;
  measures: Measure[];
}
export type ScoreIssueCode = 'schema' | 'duplicate-id' | 'event-order' | 'event-overlap' | 'event-out-of-bar' | 'invalid-tie';
export interface ScoreIssue { code: ScoreIssueCode; path: string; message: string }
export class ScoreValidationError extends Error {
  readonly issues: ScoreIssue[];
  constructor(issues: ScoreIssue[]) {
    super('The lead sheet does not conform to score version 1.');
    this.name = 'ScoreValidationError';
    this.issues = issues;
  }
}

// Validate rather than normalize: every client must see the same original score and spelling.
const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validateShape = ajv.compile<LeadSheet>(scoreSchema);

export function durationTicks(duration: NoteDuration): number {
  return (TICKS_PER_MEASURE / duration.denominator) * (duration.dots === 1 ? 1.5 : 1);
}
function samePitch(left: Pitch, right: Pitch): boolean {
  return left.step === right.step && left.alter === right.alter && left.octave === right.octave;
}

/** Throws on invalid input; never coerces, reorders, strips fields or changes pitch spelling. */
export function parseScore(value: unknown): LeadSheet {
  if (!validateShape(value)) {
    throw new ScoreValidationError((validateShape.errors ?? []).map(error => ({
      code: 'schema', path: error.instancePath || '/', message: error.message ?? 'Invalid score field.',
    })));
  }
  const issues: ScoreIssue[] = [];
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
        if (end > TICKS_PER_MEASURE) issues.push({ code: 'event-out-of-bar', path, message: 'Events must end inside their measure.' });
        previousStart = event.offsetTicks;
        previousEnd = Math.max(previousEnd, end);
        if ('kind' in event) voice.push({ event, start: measureIndex * TICKS_PER_MEASURE + event.offsetTicks,
          end: measureIndex * TICKS_PER_MEASURE + end, path });
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
