import { validateShapeV1 as validateShape, validateShapeV2, validateShapeV3 } from './generated/score-validators.js';
import schema from './lead-sheet-v1.schema.json' with { type: 'json' };
import { chordDefinitionKey, chordSymbol, parseChordDefinition, validateChordDefinition } from './chord-definition.js';
import schemaV3 from './lead-sheet-v3.schema.json' with { type: 'json' };
import schemaV2 from './lead-sheet-v2.schema.json' with { type: 'json' };
import { durationTicks, measureTicks, sameSpelledPitch, type LeadSheet, type MelodyEvent } from './score.js';

export const scoreSchema = schema;
export const scoreSchemaV2 = schemaV2;
export const scoreSchemaV3 = schemaV3;

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
// Shape validators are compiled during the build so strict browser CSP needs no eval.

/** Throws on invalid input; never coerces, reorders, strips fields or changes pitch spelling. */
export function parseScore(value: unknown): LeadSheet {
  const version = typeof value === 'object' && value !== null && 'schemaVersion' in value ? value.schemaVersion : 1;
  const validate = version === 3 ? validateShapeV3 : typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion === 2 ? validateShapeV2 : validateShape;
  if (!validate(value)) {
    throw new ScoreValidationError((validate.errors ?? []).map(error => ({
      code: 'schema', path: error.instancePath || '/', message: error.message ?? 'Invalid score field.',
    })));
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1_040_000) throw new ScoreValidationError([{ code: 'schema', path: '/', message: 'The score exceeds the 1,040,000-byte document limit. Shorten or simplify the sheet before applying this edit.' }]);
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
  const groups = new Map<string, { end: number; symbol: string; definition: string | undefined }>();
  for (const [i, m] of value.measures.entries()) for (const e of m.chords) {
    const path = `/measures/${i}/chords/${m.chords.indexOf(e)}`;
    if (e.definition) { try { validateChordDefinition(e.definition); if (chordSymbol(e.definition) !== e.symbol) throw new Error('Symbol differs from definition.'); } catch (error) { issues.push({ code: 'schema', path, message: (error as Error).message }); } }
    else if (!parseChordDefinition(e.symbol)) issues.push({ code: 'schema', path: `${path}/symbol`, message: 'Choose a supported chord symbol or a structured chord definition.' });
    if (!e.logicalId) continue;
    const start = i * barTicks + e.offsetTicks, previous = groups.get(e.logicalId);
    const definition = chordDefinitionKey(e.definition);
    if (!previous) { if (e.logicalId !== e.id) issues.push({ code: 'schema', path, message: 'Logical ID must reference the first chord fragment.' }); }
    else if (previous.end !== start || previous.symbol !== e.symbol || previous.definition !== definition) issues.push({ code: 'schema', path, message: 'Logical chord fragments must be contiguous and identical.' });
    groups.set(e.logicalId, { end: start + e.durationTicks, symbol: e.symbol, definition });
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
