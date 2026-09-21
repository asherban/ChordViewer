import { describe, expect, it } from 'vitest';
import { KEY_SIGNATURES, SUPPORTED_KEYS, changeScoreSettings, deleteChord, durationTicks, insertChord, keyAccidentals,
  keyLabel, measureTicks, midiToPitch, parseScore, replaceChord, type LeadSheet } from './index.js';
const blank = (): LeadSheet => ({ schemaVersion: 2, id: 'score', title: 'Key and meter', keySignature: 'C', timeSignature: { numerator: 4, denominator: 4 }, ticksPerQuarter: 480,
  measures: [{ id: 'bar', chords: [], melody: [] }] });

describe('v2 keys and meter with strict v1 compatibility', () => {
  it('supports all thirty signatures with seven explicit defaults and invariant sounding MIDI pitches', () => {
    expect(SUPPORTED_KEYS).toHaveLength(30);
    const naturals = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    for (const key of SUPPORTED_KEYS) {
      expect(parseScore({ ...blank(), keySignature: key }).keySignature).toBe(key);
      expect(Object.values(keyAccidentals(key)).filter(value => value !== 0)).toHaveLength(Math.abs(KEY_SIGNATURES[key].fifths));
      expect(Object.keys(keyAccidentals(key))).toHaveLength(7);
      for (let midi = 48; midi <= 95; midi++) {
        const pitch = midiToPitch(midi, key);
        expect((pitch.octave + 1) * 12 + naturals[pitch.step] + pitch.alter).toBe(midi);
        expect(pitch.octave).toBeGreaterThanOrEqual(3); expect(pitch.octave).toBeLessThanOrEqual(6);
      }
    }
    expect(keyAccidentals('G').F).toBe(1); expect(keyAccidentals('F').B).toBe(-1);
    expect(keyLabel('F#m')).toBe('F♯ minor'); expect(keyLabel('Bb')).toBe('B♭ major');
  });
  it('computes all supported meters without changing rhythmic values', () => {
    for (const denominator of [2, 4, 8] as const) for (let numerator = 1; numerator <= 12; numerator++) {
      const score = { ...blank(), timeSignature: { numerator, denominator } };
      expect(parseScore(score)).toEqual(score);
      expect(measureTicks(score)).toBe(numerator * 1920 / denominator);
      expect(durationTicks({ denominator: 4, dots: 0 })).toBe(480);
    }
    expect(measureTicks({ timeSignature: { numerator: 6, denominator: 8 } })).toBe(1440);
  });
  it('keeps v1 limited to C and 4/4 and rejects unsupported or malformed v2 settings', () => {
    expect(parseScore({ ...blank(), schemaVersion: 1 }).schemaVersion).toBe(1);
    for (const score of [
      { ...blank(), schemaVersion: 1, keySignature: 'G' }, { ...blank(), schemaVersion: 1, timeSignature: { numerator: 3, denominator: 4 } },
      { ...blank(), schemaVersion: 3 }, { ...blank(), keySignature: 'H' },
      ...[{ numerator: 0, denominator: 4 }, { numerator: 13, denominator: 4 }, { numerator: 4, denominator: 16 }, { numerator: 3.5, denominator: 4 }, { numerator: '3', denominator: 4 }].map(timeSignature => ({ ...blank(), timeSignature })),
    ]) expect(() => parseScore(score)).toThrow();
    for (const key of ['H', '__proto__', 'constructor'] as unknown as Parameters<typeof keyAccidentals>[0][]) {
      expect(() => keyAccidentals(key)).toThrow();
      expect(() => keyLabel(key)).toThrow();
      expect(() => midiToPitch(60, key)).toThrow();
    }
  });
  it('uses actual bar boundaries for chord insertion/replacement/deletion and cursor advancement', () => {
    for (const timeSignature of [{ numerator: 3, denominator: 8 }, { numerator: 5, denominator: 4 }, { numerator: 12, denominator: 2 }] as const) {
      const score = { ...blank(), timeSignature };
      const full = insertChord(score, { measureIndex: 0, offsetTicks: 0 }, 'C', measureTicks(score), () => 'chord');
      expect(full.position).toEqual({ measureIndex: 1, offsetTicks: 0 });
      expect(replaceChord(full.score, 'chord', 'Dm', measureTicks(score)).score.measures[0]!.chords[0]!.symbol).toBe('Dm');
      expect(deleteChord(full.score, 'chord')).toEqual(score);
      expect(() => insertChord(score, { measureIndex: 0, offsetTicks: measureTicks(score) - 120 }, 'C', 240, () => 'x')).toThrow(/barline/);
    }
  });
  it('changes key without transposing, rejects truncation, and clears only ties invalidated by meter', () => {
    const note = (id: string, offsetTicks: number, tieToNext = false) => ({ id, kind: 'note' as const, offsetTicks, pitch: { step: 'C' as const, alter: 0 as const, octave: 4 as const }, duration: { denominator: 4 as const, dots: 0 as const }, ...(tieToNext ? { tieToNext: true } : {}) });
    const score = { ...blank(), schemaVersion: 1 as const, measures: [
      { id: 'bar', chords: [], melody: [note('a', 0, true), note('b', 480), note('c', 1440, true)] },
      { id: 'bar2', chords: [], melody: [note('d', 0)] },
    ] };
    const before = structuredClone(score);
    const keyed = changeScoreSettings(score, 'F', { numerator: 4, denominator: 4 });
    expect(keyed.schemaVersion).toBe(2); expect(keyed.measures).toEqual(score.measures);
    expect(() => changeScoreSettings(score, 'F', { numerator: 3, denominator: 4 })).toThrow(/barline/);
    const expanded = changeScoreSettings(score, 'F', { numerator: 5, denominator: 4 });
    expect(expanded.measures[0]!.melody[0]).toHaveProperty('tieToNext', true);
    expect(expanded.measures[0]!.melody[2]).not.toHaveProperty('tieToNext');
    expect(score).toEqual(before);
  });
  it('enforces the largest bar and unknown-field bounds', () => {
    const score = { ...blank(), timeSignature: { numerator: 12, denominator: 2 as const } };
    score.measures[0]!.chords = [{ id: 'end', symbol: 'C', offsetTicks: 11519, durationTicks: 1 }];
    expect(parseScore(score)).toEqual(score);
    score.measures[0]!.chords[0]!.durationTicks = 2;
    expect(() => parseScore(score)).toThrow();
    expect(() => parseScore({ ...blank(), extra: true })).toThrow();
  });
});
