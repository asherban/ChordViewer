import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import example from '../fixtures/lead-sheet-v1.json' with { type: 'json' };
import { durationTicks, parseScore, ScoreValidationError, type LeadSheet } from './index.js';

// Parse at runtime: bundler JSON transforms can reject the malformed Unicode we need to validate.
const conformance = JSON.parse(readFileSync(new URL('../../tests/fixtures/music/score-validation-cases.json', import.meta.url), 'utf8')) as {
  cases: { name: string; score: unknown; valid: boolean; expectedCode?: string }[];
};

describe('shared score version 1 and 2 conformance', () => {
  for (const testCase of conformance.cases) {
    it(testCase.name, () => {
      const input = structuredClone(testCase.score);
      const before = structuredClone(input);
      if (testCase.valid) {
        expect(parseScore(input)).toEqual(input);
      } else {
        let failure: unknown;
        try { parseScore(input); } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(ScoreValidationError);
        expect((failure as ScoreValidationError).issues.map(issue => issue.code)).toContain(testCase.expectedCode);
      }
      expect(input).toEqual(before);
    });
  }
});

describe('score bounds and notation proof', () => {
  it('preserves explicit spelling, dotted durations and both cross-bar ties', () => {
    const score = parseScore(structuredClone(example));
    const melody = score.measures.flatMap(measure => measure.melody);
    expect(melody.filter(event => event.kind === 'note' && event.tieToNext).map(event => event.id))
      .toEqual(['note-b1-g-tie', 'note-b3-c-tie']);
    expect(melody.find(event => event.id === 'note-b1-f-sharp')).toMatchObject({ pitch: { step: 'F', alter: 1 } });
    expect(melody.find(event => event.id === 'note-b1-f-natural')).toMatchObject({ pitch: { step: 'F', alter: 0 } });
    expect(melody.find(event => event.id === 'note-b2-b-flat')).toMatchObject({ pitch: { step: 'B', alter: -1 } });
    expect(durationTicks({ denominator: 4, dots: 1 })).toBe(720);
    expect(durationTicks({ denominator: 8, dots: 1 })).toBe(360);
  });

  it('accepts 256 measures and rejects a 257th before musical validation', () => {
    const score: LeadSheet = { ...parseScore(structuredClone(example)),
      measures: Array.from({ length: 256 }, (_, index) => ({ id: `measure-${index}`, chords: [], melody: [] })) };
    expect(parseScore(score).measures).toHaveLength(256);
    score.measures.push({ id: 'measure-256', chords: [], melody: [] });
    expect(() => parseScore(score)).toThrow(ScoreValidationError);
  });

  it('accepts 64 short chord slots and rejects a 65th', () => {
    const score = parseScore(structuredClone(example));
    const measure = score.measures[0]!;
    measure.chords = Array.from({ length: 64 }, (_, index) => ({ id: `chord-${index}`, offsetTicks: index, durationTicks: 1, symbol: 'C' }));
    expect(parseScore(score).measures[0]!.chords).toHaveLength(64);
    measure.chords.push({ id: 'chord-64', offsetTicks: 64, durationTicks: 1, symbol: 'C' });
    expect(() => parseScore(score)).toThrow(ScoreValidationError);
  });

  it('rejects duplicate IDs across different measures and lanes', () => {
    const score = parseScore(structuredClone(example));
    score.measures[3]!.chords[0]!.id = score.measures[0]!.melody[0]!.id;
    try { parseScore(score); throw new Error('Expected a duplicate-ID error.'); }
    catch (error) {
      expect(error).toBeInstanceOf(ScoreValidationError);
      expect((error as ScoreValidationError).issues).toContainEqual(expect.objectContaining({ code: 'duplicate-id' }));
    }
  });

  it('rejects non-JSON numeric values and does not coerce incoming types', () => {
    for (const invalid of [NaN, Infinity, -Infinity, '480', null, true]) {
      const score: unknown = { ...example, ticksPerQuarter: invalid };
      expect(() => parseScore(score)).toThrow(ScoreValidationError);
    }
  });
});
