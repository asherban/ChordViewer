import { describe, expect, it } from 'vitest';
import fixture from '../../tests/fixtures/music/melody-authoring-cases.json' with { type: 'json' };
import example from '../fixtures/lead-sheet-v1.json' with { type: 'json' };
import { MELODY_DURATIONS, MelodyEntryError, changeScoreSettings, deleteMelody, durationTicks, findMelody, insertMelody,
  midiToPitch, parseScore, replaceMelody, setMelodyTie, type LeadSheet, type MelodySpec, type KeySignature } from './index.js';

function blank(): LeadSheet { return parseScore({ ...fixture.baseScore, measures: [{ id: 'bar', chords: [], melody: [] }] }); }
function issue(action: () => unknown, code: string): void {
  try { action(); throw new Error('Expected a rejected melody edit.'); }
  catch (error) { expect(error).toBeInstanceOf(MelodyEntryError); expect((error as MelodyEntryError).code).toBe(code); }
}
const quarter: MelodySpec = { kind: 'note', pitch: { step: 'C', alter: 0, octave: 4 }, duration: { denominator: 4, dots: 0 } };

describe('shared melody authoring parity', () => {
  for (const testCase of fixture.midi) it(`spells MIDI ${testCase.midi} in ${testCase.key}`, () => {
    if ('code' in testCase) issue(() => midiToPitch(testCase.midi, testCase.key as KeySignature), testCase.code!);
    else expect(midiToPitch(testCase.midi, testCase.key as KeySignature)).toEqual(testCase.pitch);
  });
  for (const testCase of fixture.cases) it(testCase.name, () => {
    let score = parseScore({ ...fixture.baseScore, ...('overrides' in testCase ? testCase.overrides : {}), measures: structuredClone(testCase.measures) });
    const originalChords = structuredClone(score.measures.map(bar => bar.chords));
    for (const action of testCase.actions) {
      const before = structuredClone(score);
      const run = () => {
        if (action.op === 'insert' || action.op === 'replace') {
          const identifiers = 'ids' in action ? [...action.ids!] : [];
          const result = action.op === 'insert'
            ? insertMelody(score, action.position!, action.spec as MelodySpec, () => identifiers.shift()!)
            : replaceMelody(score, action.id!, action.spec as MelodySpec);
          if ('cursor' in action) expect(result.position).toEqual(action.cursor);
          if ('tieExpected' in action) expect((findMelody(result.score, result.eventId)!.event as { tieToNext?: boolean }).tieToNext ?? false).toBe(action.tieExpected);
          return result.score;
        }
        return action.op === 'delete' ? deleteMelody(score, action.id!) : setMelodyTie(score, action.id!, action.enabled!);
      };
      if ('code' in action) { issue(run, action.code!); expect(score).toEqual(before); }
      else { const original = score; score = run(); expect(original).toEqual(before); }
      expect(score.measures.slice(0, originalChords.length).map(bar => bar.chords)).toEqual(originalChords);
      expect(parseScore(score)).toEqual(score);
    }
    expect(score.measures.map(bar => bar.melody)).toEqual(testCase.expectedMelody);
  });
});

describe('melody mutation boundaries and invariants', () => {
  it('keeps every supported duration exact, with dotted whole allowed in larger meters', () => {
    const score = changeScoreSettings(blank(), 'C', { numerator: 3, denominator: 2 });
    for (const duration of MELODY_DURATIONS) {
      const result = insertMelody(score, { measureIndex: 0, offsetTicks: 0 }, { kind: 'rest', duration }, () => 'rest');
      expect(findMelody(result.score, result.eventId)!.event.duration).toEqual(duration);
      expect(result.position).toEqual(durationTicks(duration) === 2880 ? { measureIndex: 1, offsetTicks: 0 } : { measureIndex: 0, offsetTicks: durationTicks(duration) });
    }
    issue(() => insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, { kind: 'rest', duration: { denominator: 1, dots: 1 } }, () => 'rest'), 'barline');
  });
  it('preserves stored off-grid offsets during correction and rest deletion', () => {
    const inserted = insertMelody(blank(), { measureIndex: 0, offsetTicks: 121 }, quarter, () => 'note').score;
    const rest = deleteMelody(inserted, 'note');
    expect(findMelody(rest, 'note')).toEqual({ position: { measureIndex: 0, offsetTicks: 121 }, event: { id: 'note', kind: 'rest', offsetTicks: 121, duration: quarter.duration } });
    expect(replaceMelody(rest, 'note', quarter).score).toEqual(inserted);
  });
  it('rejects a longer replacement overlapping the following event without changing either lane', () => {
    let score = insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, quarter, () => 'a').score;
    score = insertMelody(score, { measureIndex: 0, offsetTicks: 480 }, quarter, () => 'b').score;
    const before = structuredClone(score);
    issue(() => replaceMelody(score, 'a', { ...quarter, duration: { denominator: 2, dots: 0 } }), 'occupied');
    expect(score).toEqual(before);
  });
  it('rejects malformed positions, durations, pitches, kinds and IDs', () => {
    for (const position of [{ measureIndex: -1, offsetTicks: 0 }, { measureIndex: 2, offsetTicks: 0 }, { measureIndex: 0, offsetTicks: 1920 }, { measureIndex: 0, offsetTicks: NaN }])
      issue(() => insertMelody(blank(), position, quarter, () => 'a'), 'position');
    for (const duration of [{ denominator: 3, dots: 0 }, { denominator: 4, dots: 2 }, { denominator: '4', dots: 0 }, null])
      issue(() => insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, { ...quarter, duration } as unknown as MelodySpec, () => 'a'), 'duration');
    for (const pitch of [{ step: 'H', alter: 0, octave: 4 }, { step: 'C', alter: 2, octave: 4 }, { step: 'C', alter: 0, octave: 2 }, null])
      issue(() => replaceMelody(insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, quarter, () => 'a').score, 'a', { ...quarter, pitch } as unknown as MelodySpec), 'pitch');
    issue(() => insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, { kind: 'chord' } as unknown as MelodySpec, () => 'a'), 'kind');
    for (const id of ['', 'score', 'bar', 'bad\n', 'n'.repeat(65)]) issue(() => insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, quarter, () => id), 'id');
    issue(() => insertMelody(blank(), { measureIndex: 1, offsetTicks: 0 }, quarter, () => 'duplicate'), 'id');
    for (const midi of [NaN, Infinity, 60.5]) issue(() => midiToPitch(midi), 'pitch');
  });
  it('checks missing IDs and refuses ties to a rest or nonexistent successor', () => {
    issue(() => replaceMelody(blank(), 'missing', quarter), 'missing');
    issue(() => deleteMelody(blank(), 'missing'), 'missing');
    issue(() => setMelodyTie(blank(), 'missing', true), 'missing');
    const score = insertMelody(blank(), { measureIndex: 0, offsetTicks: 0 }, { kind: 'rest', duration: quarter.duration }, () => 'r').score;
    issue(() => setMelodyTie(score, 'r', true), 'tie');
    expect(setMelodyTie(score, 'r', false)).toEqual(score);
  });
  it('protects sheet and bar limits before consuming IDs', () => {
    const score = { ...blank(), measures: Array.from({ length: 256 }, (_, index) => ({ id: `bar-${index}`, chords: [], melody: [] })) };
    let count = 0;
    issue(() => insertMelody(score, { measureIndex: 256, offsetTicks: 0 }, quarter, () => `unused-${count++}`), 'limit');
    const large = changeScoreSettings(blank(), 'C', { numerator: 12, denominator: 2 });
    large.measures[0]!.melody = Array.from({ length: 64 }, (_, index) => ({ id: `r-${index}`, kind: 'rest', offsetTicks: index * 120, duration: { denominator: 16, dots: 0 } }));
    issue(() => insertMelody(large, { measureIndex: 0, offsetTicks: 7680 }, quarter, () => `unused-${count++}`), 'limit');
    expect(count).toBe(0);
  });
  it('leaves source specs and all unrelated chord/melody events untouched', () => {
    const score = parseScore(structuredClone(example));
    const before = structuredClone(score);
    const target = score.measures[0]!.melody[0]!;
    const spec = structuredClone(quarter);
    const changed = replaceMelody(score, target.id, spec).score;
    expect(score).toEqual(before);
    expect(changed.measures.map(bar => bar.chords)).toEqual(before.measures.map(bar => bar.chords));
    const altered = findMelody(changed, target.id)!.event;
    if (altered.kind === 'note') altered.pitch.alter = -1;
    expect(spec).toEqual(quarter);
  });
});
