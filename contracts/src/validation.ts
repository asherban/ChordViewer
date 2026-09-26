import { Ajv } from 'ajv';
import schema from './lead-sheet-v1.schema.json' with { type: 'json' };
import schemaV2 from './lead-sheet-v2.schema.json' with { type: 'json' };
import { durationTicks, measureTicks, sameSpelledPitch, type LeadSheet, type MelodyEvent } from './score.js';

export const scoreSchema = schema;
export const scoreSchemaV2 = schemaV2;

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
    if (!next || next.event.kind !== 'note' || item.end !== next.start || !sameSpelledPitch(item.event.pitch, next.event.pitch)) {
      issues.push({ code: 'invalid-tie', path: `${item.path}/tieToNext`, message: 'A tie requires an adjacent following note with the same spelled pitch.' });
    }
  }
  if (issues.length > 0) throw new ScoreValidationError(issues);
  return value;
}
