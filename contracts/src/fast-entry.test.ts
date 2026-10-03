import { describe, expect, it } from 'vitest';
import { insertBar, splitDuration, writeChord, writeMelody, nextMelodyPosition, changeMelodyAndShift, melodyGroup, deleteMelodyAndShift, trimTrailingSilentBars } from './fast-entry.js';
import { durationTicks, type LeadSheet } from './score.js';
import { notationRests } from './notation-rests.js';

const sheet = (): LeadSheet => ({ schemaVersion: 2, id: 'sheet', title: 'Entry study', keySignature: 'C', timeSignature: { numerator: 4, denominator: 4 }, ticksPerQuarter: 480,
  measures: [{ id: 'bar', chords: [{ id: 'c', symbol: 'C', offsetTicks: 0, durationTicks: 1920 }], melody: [{ id: 'n', kind: 'note', pitch: { step: 'C', alter: 0, octave: 4 }, offsetTicks: 0, duration: { denominator: 1, dots: 0 } }] }] });
const ids = () => { let n = 0; return () => `new-${++n}`; };
const position = (offsetTicks: number) => ({ measureIndex: 0, offsetTicks });
describe('continuous score entry', () => {
  it('trims every silent trailing bar while preserving interior silence and chord-only bars', () => {
    const score = sheet();
    score.measures.push(
      { id: 'interior', chords: [], melody: [{ id: 'rest', kind: 'rest', offsetTicks: 0, duration: { denominator: 1, dots: 0 } }] },
      { id: 'chord-only', chords: [{ id: 'g', symbol: 'G', offsetTicks: 0, durationTicks: 1920 }], melody: [] },
      { id: 'silent', chords: [], melody: [{ id: 'last-rest', kind: 'rest', offsetTicks: 0, duration: { denominator: 1, dots: 0 } }] },
      { id: 'empty', chords: [], melody: [] });
    const trimmed = trimTrailingSilentBars(score);
    expect(trimmed.measures).toEqual(score.measures.slice(0, 3));
    expect(score.measures).toHaveLength(5);
    expect(trimTrailingSilentBars(trimmed)).toBe(trimmed);
    expect(trimTrailingSilentBars(score, 4).measures).toHaveLength(4);
  });
  it('keeps one editable bar when the entire sheet is silent', () => {
    const score = sheet();
    score.measures = ['first', 'last'].map(id => ({ id, chords: [], melody: [] }));
    expect(trimTrailingSilentBars(score).measures).toEqual([score.measures[0]]);
  });
  it('edits, resizes and deletes the whole tied note from any fragment', () => {
    const original = sheet(); original.measures[0].melody = [];
    const score = writeMelody(original, position(1440), { kind: 'note', pitch: { step: 'C', alter: 0, octave: 4 }, duration: { denominator: 2, dots: 0 } }, ids()).score;
    score.measures[1].melody.push({ id: 'later', kind: 'rest', offsetTicks: 480, duration: { denominator: 4, dots: 0 } });
    const tail = score.measures[1].melody[0].id, group = melodyGroup(score, tail)!;
    expect(group.ticks).toBe(960); expect(group.ids).toHaveLength(2);
    let counter = 100; const allocate = () => 'edit-' + counter++;
    const pitched = changeMelodyAndShift(score, tail, { kind: 'note', pitch: { step: 'G', alter: 0, octave: 4 }, duration: group.event.duration }, allocate, group.ticks).score;
    expect(pitched.measures.flatMap(m => m.melody).filter(e => e.kind === 'note').every(e => e.pitch.step === 'G')).toBe(true);
    expect(pitched.measures[1].melody.find(e => e.id === 'later')?.offsetTicks).toBe(480);
    const short = changeMelodyAndShift(score, tail, { kind: 'note', pitch: { step: 'D', alter: 0, octave: 4 }, duration: { denominator: 4, dots: 0 } }, allocate).score;
    expect(short.measures[1].melody[0]).toMatchObject({ id: 'later', offsetTicks: 0 });
    const deleted = deleteMelodyAndShift(score, tail, allocate);
    expect(deleted.measures[0].melody).toEqual([{ id: 'later', kind: 'rest', offsetTicks: 1440, duration: { denominator: 4, dots: 0 } }]);
    expect(deleted.measures[0].chords).toEqual(score.measures[0].chords);
  });
  it('shows missing time as exact rests without moving the next-entry cursor', () => {
    const score = sheet(); score.measures[0].melody = [
      { id: 'one', kind: 'note', pitch: { step: 'E', alter: 0, octave: 4 }, offsetTicks: 0, duration: { denominator: 4, dots: 0 } },
      { id: 'two', kind: 'note', pitch: { step: 'G', alter: 0, octave: 4 }, offsetTicks: 540, duration: { denominator: 2, dots: 0 } }];
    const rests = notationRests(score.measures[0], 1920);
    expect(rests.map(r => r.ticks).reduce((sum, ticks) => sum + ticks, 0)).toBe(480);
    expect(rests[0]).toMatchObject({ offsetTicks: 480, ticks: 60, duration: { denominator: 32 } });
    expect(nextMelodyPosition(score)).toEqual(position(1500));
  });
  it('shifts later notes and rests across barlines while preserving chords, IDs and undo input', () => {
    const original = sheet();
    original.measures[0].melody = ['C', 'D', 'E', 'F'].map((step, i) => ({ id: `n${i}`, kind: 'note',
      pitch: { step: step as 'C', alter: 0, octave: 4 }, offsetTicks: i * 480, duration: { denominator: 4, dots: 0 } }));
    const before = JSON.stringify(original);
    const result = changeMelodyAndShift(original, 'n1', { kind: 'rest', duration: { denominator: 2, dots: 1 } }, ids()).score;
    expect(result.measures[0].melody.map(n => [n.id, n.offsetTicks, n.kind])).toEqual([['n0', 0, 'note'], ['n1', 480, 'rest']]);
    expect(result.measures[1].melody.map(n => [n.id, n.offsetTicks])).toEqual([['n2', 0], ['n3', 480]]);
    expect(result.measures[0].chords).toEqual(original.measures[0].chords);
    expect(nextMelodyPosition(result)).toEqual({ measureIndex: 1, offsetTicks: 960 });
    expect(JSON.stringify(original)).toBe(before);
    const shorter = changeMelodyAndShift(result, 'n1', { kind: 'rest', duration: { denominator: 8, dots: 0 } }, ids()).score;
    expect(shorter.measures[0].melody.map(n => [n.id, n.offsetTicks])).toEqual([['n0', 0], ['n1', 480], ['n2', 720], ['n3', 1200]]);
    expect(nextMelodyPosition(shorter)).toEqual({ measureIndex: 0, offsetTicks: 1680 });
  });
  it('splits shifted notes into tied fragments and rejects overflow atomically', () => {
    const original = sheet();
    original.measures[0].melody = [
      { id: 'a', kind: 'rest', offsetTicks: 0, duration: { denominator: 2, dots: 0 } },
      { id: 'b', kind: 'note', pitch: { step: 'G', alter: 0, octave: 4 }, offsetTicks: 960, duration: { denominator: 2, dots: 0 } },
    ];
    const result = changeMelodyAndShift(original, 'a', { kind: 'rest', duration: { denominator: 2, dots: 1 } }, ids()).score;
    expect(result.measures[0].melody[1]).toMatchObject({ id: 'b', offsetTicks: 1440, tieToNext: true });
    expect(result.measures[1].melody[0]).toMatchObject({ offsetTicks: 0, duration: { denominator: 4, dots: 0 } });
    const full = sheet();
    full.measures = Array.from({ length: 256 }, (_, i) => ({ id: `bar${i}`, chords: [], melody: i === 255 ? full.measures[0].melody : [] }));
    const before = JSON.stringify(full);
    expect(() => changeMelodyAndShift(full, 'n', { kind: 'rest', duration: { denominator: 1, dots: 1 } }, ids())).toThrow('256-bar');
    expect(JSON.stringify(full)).toBe(before);
  });
  it('overwrites only the entered chord span and keeps both tails and the melody', () => {
    const original = sheet(), before = JSON.stringify(original);
    const result = writeChord(original, position(480), 'Dm7', 480, ids());
    expect(result.score.measures[0].chords.map(e => [e.symbol, e.offsetTicks, e.durationTicks])).toEqual([['C', 0, 480], ['Dm7', 480, 480], ['C', 960, 960]]);
    expect(result.score.measures[0].chords[0].id).toBe('c');
    expect(result.score.measures[0].melody).toEqual(original.measures[0].melody);
    expect(JSON.stringify(original)).toBe(before);
  });
  it('extends chords across barlines and advances exactly', () => {
    const result = writeChord(sheet(), position(1440), 'G7', 1920, ids());
    expect(result.score.measures[1].chords[0]).toMatchObject({ offsetTicks: 0, durationTicks: 1440, symbol: 'G7' });
    expect(result.position).toEqual({ measureIndex: 1, offsetTicks: 1440 });
  });
  it('writes tied note fragments across barlines without changing chords', () => {
    const original = sheet();
    const result = writeMelody(original, position(1440), { kind: 'note', pitch: { step: 'D', alter: 0, octave: 5 }, duration: { denominator: 2, dots: 0 } }, ids());
    expect(result.score.measures[0].melody.at(-1)).toMatchObject({ tieToNext: true, duration: { denominator: 4, dots: 0 } });
    expect(result.score.measures[1].melody[0]).toMatchObject({ pitch: { step: 'D', alter: 0, octave: 5 }, duration: { denominator: 4, dots: 0 } });
    expect(result.score.measures[0].chords).toEqual(original.measures[0].chords);
  });
  it('preserves exact representable tails and rejects an unrepresentable remainder atomically', () => {
    expect(splitDuration(300).reduce((sum, d) => sum + durationTicks(d), 0)).toBe(300);
    expect(splitDuration(60).map(durationTicks)).toEqual([60]);
    const original = sheet(), before = JSON.stringify(original);
    expect(() => writeMelody(original, position(1), { kind: 'rest', duration: { denominator: 4, dots: 0 } }, ids())).toThrow('cannot represent');
    expect(JSON.stringify(original)).toBe(before);
  });
  it('inserts a bar in both lanes and breaks a tie across the new gap', () => {
    const original = writeMelody(sheet(), position(1440), { kind: 'note', pitch: { step: 'D', alter: 0, octave: 5 }, duration: { denominator: 2, dots: 0 } }, ids()).score;
    const result = insertBar(original, 1, () => 'middle');
    expect(result.measures[1]).toEqual({ id: 'middle', chords: [], melody: [] });
    expect(result.measures[2]).toEqual(original.measures[1]);
    expect(result.measures[0].melody.at(-1)).not.toHaveProperty('tieToNext');
  });
  it('moves a chord atomically while preserving its ID and leaving the original gap', () => {
    const result = writeChord(sheet(), { measureIndex: 1, offsetTicks: 0 }, 'C', 1920, ids(), 'c');
    expect(result.score.measures[0].chords).toEqual([]);
    expect(result.score.measures[1].chords[0].id).toBe('c');
  });
  it('enforces limits before creating a partial edit', () => {
    const original = sheet(); original.measures = Array.from({ length: 256 }, (_, i) => ({ id: `bar-${i}`, chords: [], melody: [] }));
    expect(() => writeChord(original, { measureIndex: 255, offsetTicks: 1440 }, 'C', 960, ids())).toThrow('256-bar');
    expect(() => insertBar(original, 0, ids())).toThrow('256-bar');
    expect(original.measures).toHaveLength(256);
  });
  it('preserves untouched off-grid music while extending a dotted note in 6/8', () => {
    const original = sheet(); original.timeSignature = { numerator: 6, denominator: 8 };
    original.measures[0].chords = [{ id: 'off-grid', symbol: 'G/B', offsetTicks: 13, durationTicks: 901 }];
    original.measures[0].melody = [{ id: 'off-note', kind: 'note', offsetTicks: 7, pitch: { step: 'F', alter: 1, octave: 4 }, duration: { denominator: 8, dots: 0 } }];
    const result = writeMelody(original, position(1200), { kind: 'note', pitch: { step: 'A', alter: -1, octave: 4 }, duration: { denominator: 4, dots: 1 } }, ids());
    expect(result.score.measures[0].melody[0]).toEqual(original.measures[0].melody[0]);
    expect(result.score.measures[0].chords).toEqual(original.measures[0].chords);
    expect(result.score.measures[0].melody[1]).toMatchObject({ duration: { denominator: 8, dots: 0 }, tieToNext: true });
    expect(result.score.measures[1].melody[0]).toMatchObject({ duration: { denominator: 4, dots: 0 }, pitch: { step: 'A', alter: -1, octave: 4 } });
    expect(result.position).toEqual({ measureIndex: 1, offsetTicks: 480 });
  });
});
