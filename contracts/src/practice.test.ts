import { describe, expect, it } from 'vitest';
import vocabulary from '../fixtures/chord-vocabulary-v1.json' with { type: 'json' };
import cases from '../../tests/fixtures/music/practice-cases.json' with { type: 'json' };
import example from '../fixtures/lead-sheet-v1.json' with { type: 'json' };
import { parseScore, type LeadSheet } from './index.js';
import { matchesPracticeChord, PracticeSession, transposePracticeScore } from './practice.js';

const base = parseScore(example);
function score(symbols: string[], gap = false): LeadSheet {
  const measures = symbols.map((symbol, index) => ({
    id: `bar-${index}`, chords: symbol ? [{ id: `chord-${index}`, offsetTicks: 0, durationTicks: 1920, symbol }] : [], melody: [],
  }));
  return parseScore({ ...base, measures: gap ? [measures[0], { id: 'gap', chords: [], melody: [] }, ...measures.slice(1)] : measures });
}
function gesture(session: PracticeSession, notes: number[]) {
  for (const note of notes) session.receive([0x90, note, 100]);
  for (const note of notes) session.receive([0x80, note, 0]);
}
describe('practice rules', () => {
  it('uses shared exact pitch-class fixtures, optional tones and explicit slash bass', () => {
    expect(vocabulary.entries.length).toBeGreaterThan(10);
    for (const test of cases.matches) expect(matchesPracticeChord(test.symbol, test.notes), test.symbol).toBe(test.result);
  });
  it('keeps empty bars honest and advances one fresh physical gesture per event', () => {
    const sheet = score(['C', 'C', 'F'], true);
    const session = new PracticeSession(sheet);
    session.setAdvance('match');
    gesture(session, [60, 64, 67]);
    expect(session.state.bar).toBe(2);
    expect(session.state.eventIndex).toBe(1);
    session.selectBar(1);
    expect(session.state.eventIndex).toBe(-1);
    gesture(session, [60, 64, 67]);
    expect(session.state.bar).toBe(1);
    session.selectBar(2);
    session.receive([0x90, 60, 100]);
    session.setAdvance('match'); // arming while held waits for release
    session.receive([0x80, 60, 0]);
    gesture(session, [60, 64, 67]);
    expect(session.state.eventIndex).toBe(2);
    gesture(session, [65, 69, 72]);
    expect(session.state.complete).toBe(true);
    gesture(session, [65, 69, 72]);
    expect(session.state.complete).toBe(true);
    session.selectBar(0);
    expect(session.state.complete).toBe(false);
  });
  it('resets partial gestures on interruption and retains a moved event by identity', () => {
    const sheet = score(['C', 'F']);
    const session = new PracticeSession(sheet);
    session.setAdvance('match');
    session.receive([0x90, 60, 100]);
    session.reset([60]);
    session.receive([0x80, 60, 0]);
    gesture(session, [60, 64, 67]);
    expect(session.state.eventIndex).toBe(1);
    const changed = parseScore({ ...sheet, measures: [sheet.measures[0], { id: 'inserted', chords: [], melody: [] }, sheet.measures[1]] });
    session.setScore(changed);
    expect(session.state.bar).toBe(2);
    session.setScore(score(['C', '']));
    expect(session.state.eventIndex).toBe(-1);
  });
  it('transposes only a derived validated view, including legacy v1 and exact melody/ties', () => {
    const before = JSON.stringify(base);
    const shifted = transposePracticeScore(base, 1);
    expect(shifted.schemaVersion).toBe(2);
    expect(shifted.keySignature).toBe('C#');
    expect(JSON.stringify(base)).toBe(before);
    expect(shifted.measures[0].melody[0]?.kind).toBe(base.measures[0].melody[0]?.kind);
    const minor = parseScore({ ...base, schemaVersion: 2, keySignature: 'Am', measures: base.measures.map((measure, index) => ({
      ...measure, chords: index === 0 ? [{ ...measure.chords[0], symbol: 'Am/C' }, ...measure.chords.slice(1)] : measure.chords,
    })) });
    const source = JSON.stringify(minor);
    for (const [shift, key, chord, pitch] of [
      [2, 'Bm', 'Bm/D', { step: 'D', alter: 0, octave: 4 }],
      [-2, 'Gm', 'Gm/Bb', { step: 'B', alter: -1, octave: 3 }],
    ] as const) {
      const result = transposePracticeScore(minor, shift);
      expect(result.keySignature).toBe(key);
      expect(result.measures[0].chords[0].symbol).toBe(chord);
      expect(result.measures[0].melody[0].pitch).toEqual(pitch);
      expect(result.measures.map(bar => bar.id)).toEqual(minor.measures.map(bar => bar.id));
      expect(result.measures.flatMap(bar => bar.chords.map(({ id, offsetTicks, durationTicks }) => ({ id, offsetTicks, durationTicks }))))
        .toEqual(minor.measures.flatMap(bar => bar.chords.map(({ id, offsetTicks, durationTicks }) => ({ id, offsetTicks, durationTicks }))));
      expect(result.measures.flatMap(bar => bar.melody.map(({ id, kind, offsetTicks, duration, tieToNext }) => ({ id, kind, offsetTicks, duration, tieToNext }))))
        .toEqual(minor.measures.flatMap(bar => bar.melody.map(({ id, kind, offsetTicks, duration, tieToNext }) => ({ id, kind, offsetTicks, duration, tieToNext }))));
      expect(result.measures[0].melody[3].kind).toBe('rest');
    }
    expect(JSON.stringify(minor)).toBe(source);
    expect(() => transposePracticeScore(score(['verse']), 1)).toThrow(/unsupported chord/);
    const high = parseScore({ ...score(['C']), measures: [{ id: 'high', chords: [], melody: [{
      id: 'note', kind: 'note', offsetTicks: 0, duration: { denominator: 4, dots: 0 }, pitch: { step: 'B', alter: 0, octave: 6 },
    }] }] });
    expect(() => transposePracticeScore(high, 1)).toThrow(/range/);
  });
});
