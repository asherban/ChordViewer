import { describe, expect, it } from 'vitest';
import example from '../fixtures/lead-sheet-v1.json' with { type: 'json' };
import vocabulary from '../fixtures/chord-vocabulary-v1.json' with { type: 'json' };
import legacyRecognition from '../../tests/fixtures/music/chord-recognition-cases.json' with { type: 'json' };
import authoring from '../../tests/fixtures/music/chord-authoring-cases.json' with { type: 'json' };
import { CHORD_DURATIONS, ChordCapture, ChordEntryError, deleteChord, findChord, insertChord, parseScore,
  recognizeChord, replaceChord, type ChordPosition, type LeadSheet } from './index.js';

function scoreWithMelody(): LeadSheet {
  const score = parseScore(structuredClone(example));
  return { ...score, measures: score.measures.map(measure => ({ ...measure, chords: [] })) };
}
function blankScore(measures = 1): LeadSheet {
  return { ...scoreWithMelody(), measures: Array.from({ length: measures }, (_, index) => ({ id: `bar-${index}`, chords: [], melody: [] })) };
}
function ids(): () => string {
  let next = 0;
  return () => `new-${next++}`;
}
function expectIssue(run: () => unknown, code: string): void {
  try { run(); throw new Error('Expected a chord entry error.'); }
  catch (error) {
    expect(error).toBeInstanceOf(ChordEntryError);
    expect((error as ChordEntryError).code).toBe(code);
  }
}

describe('shared recognition parity', () => {
  for (const testCase of legacyRecognition.cases) {
    it(`M2 identity: ${testCase.name}`, () => {
      const result = recognizeChord(testCase.midiNotes);
      expect(result.pitchClasses).toEqual(testCase.expected.pitchClasses);
      expect(result.bassMidi).toEqual(testCase.expected.bassMidi);
      if (testCase.expected.chord === null) expect(result.candidates).toEqual([]);
      else expect(result.candidates[0]).toMatchObject(testCase.expected.chord);
    });
  }
  for (const testCase of authoring.recognition) {
    it(`M4 symbols: ${testCase.name}`, () => {
      expect(recognizeChord(testCase.midiNotes).candidates.map(candidate => candidate.symbol)).toEqual(testCase.symbols);
    });
  }
  for (const entry of vocabulary.entries) {
    it(`${entry.quality} keeps its identity in all twelve keys`, () => {
      for (let root = 0; root < 12; root += 1) {
        const midiNotes = entry.intervals.map(interval => 48 + root + interval);
        expect(recognizeChord(midiNotes).candidates).toContainEqual(expect.objectContaining({ rootPitchClass: root, quality: entry.quality }));
      }
    });
  }
  it('does not coerce or silently ignore invalid MIDI pitches', () => {
    for (const pitch of [-1, 128, 60.5, NaN, Infinity]) expect(() => recognizeChord([60, 64, pitch])).toThrow(RangeError);
  });
  it('does not mutate caller notes or depend on their input order', () => {
    const notes = Object.freeze([67, 60, 72, 64]);
    expect(recognizeChord(notes)).toEqual(recognizeChord([60, 64, 67]));
    expect(notes).toEqual([67, 60, 72, 64]);
  });
});

describe('ordered raw MIDI gesture capture', () => {
  for (const testCase of authoring.capture) {
    it(testCase.name, () => {
      const capture = new ChordCapture();
      for (const step of testCase.steps) {
        if ('enable' in step) capture.setEnabled(step.enable);
        else if ('resetHeld' in step) capture.reset(step.resetHeld);
        else expect(capture.receive(step.bytes)).toEqual('gesture' in step ? step.gesture : null);
      }
      expect(capture.heldIds).toEqual([]);
      expect(capture.candidatePitches).toEqual([]);
    });
  }
  it('ignores malformed and unrelated messages without clearing the physical gesture', () => {
    const capture = new ChordCapture();
    capture.setEnabled(true);
    capture.receive([0x90, 60, 90]);
    for (const bytes of [[], [0xfe], [0x90, 64], [0x90, 64, 90, 0], [0x90, 128, 90], [0x90, 64, -1],
      [0x90, 64.5, 90], [0x90, 64, NaN], [0x70, 60, 0], [0xf0, 60, 0], [0xe0, 0, 64], [0xb0, 1, 127]]) {
      expect(capture.receive(bytes)).toBeNull();
    }
    expect(capture.candidatePitches).toEqual([60]);
    expect(capture.receive(new Uint8Array([0x80, 60, 0]))).toEqual([60]);
  });
  it('retains octave pitches for bass recognition while deduplicating repeated pitches', () => {
    const capture = new ChordCapture();
    capture.setEnabled(true);
    for (const note of [72, 52, 67, 60, 64, 72]) capture.receive([0x90, note, 90]);
    for (const note of [72, 52, 67, 60]) expect(capture.receive([0x80, note, 0])).toBeNull();
    const completed = capture.receive([0x80, 64, 0]);
    expect(completed).toEqual([52, 60, 64, 67, 72]);
    expect(recognizeChord(completed!).candidates[0]?.symbol).toBe('C/E');
  });
  it('isolates returned state from internal held and candidate sets', () => {
    const capture = new ChordCapture();
    capture.setEnabled(true);
    capture.receive([0x9f, 127, 127]);
    capture.heldIds.length = 0;
    capture.candidatePitches.push(60);
    expect(capture.receive([0x8f, 127, 0])).toEqual([127]);
  });
  it('requires a fresh gesture after repeated arming while notes are held', () => {
    const capture = new ChordCapture();
    capture.setEnabled(true);
    capture.receive([0x90, 60, 90]);
    capture.setEnabled(true);
    expect(capture.receive([0x80, 60, 0])).toBeNull();
    capture.receive([0x90, 64, 90]);
    expect(capture.receive([0x80, 64, 0])).toEqual([64]);
  });
});

describe('immutable chord editing', () => {
  for (const duration of CHORD_DURATIONS) {
    it(`inserts ${duration} ticks and advances exactly that duration`, () => {
      const score = scoreWithMelody();
      const original = structuredClone(score);
      const result = insertChord(score, { measureIndex: 0, offsetTicks: 0 }, 'C', duration, ids());
      expect(result.position).toEqual(duration === 1920 ? { measureIndex: 1, offsetTicks: 0 } : { measureIndex: 0, offsetTicks: duration });
      expect(result.score.measures[0]!.chords).toEqual([{ id: result.eventId, offsetTicks: 0, durationTicks: duration, symbol: 'C' }]);
      expect(result.score.measures.map(measure => measure.melody)).toEqual(original.measures.map(measure => measure.melody));
      expect(score).toEqual(original);
    });
  }
  it('sorts a new earlier chord without altering the later event or melody', () => {
    const factory = ids();
    const later = insertChord(scoreWithMelody(), { measureIndex: 0, offsetTicks: 960 }, 'G7', 960, factory);
    const result = insertChord(later.score, { measureIndex: 0, offsetTicks: 0 }, 'C', 480, factory);
    expect(result.score.measures[0]!.chords.map(event => event.symbol)).toEqual(['C', 'G7']);
    expect(result.score.measures[0]!.chords[1]).toBe(later.score.measures[0]!.chords[0]);
    expect(result.score.measures[0]!.melody).toBe(later.score.measures[0]!.melody);
  });
  it('advances to a virtual next bar and creates it only on the following insertion', () => {
    const factory = ids();
    const first = insertChord(blankScore(), { measureIndex: 0, offsetTicks: 0 }, 'C', 1920, factory);
    expect(first.position).toEqual({ measureIndex: 1, offsetTicks: 0 });
    expect(first.score.measures).toHaveLength(1);
    const next = insertChord(first.score, first.position, 'F', 960, factory);
    expect(next.score.measures).toHaveLength(2);
    expect(next.score.measures[1]).toEqual({ id: 'new-2', chords: [{ id: 'new-1', symbol: 'F', offsetTicks: 0, durationTicks: 960 }], melody: [] });
    expect(next.position).toEqual({ measureIndex: 1, offsetTicks: 960 });
    expect(first.score.measures).toHaveLength(1);
  });
  it('rejects overlap on either edge, including an already occupied selected slot', () => {
    const first = insertChord(blankScore(), { measureIndex: 0, offsetTicks: 480 }, 'C', 480, ids());
    for (const [offsetTicks, duration] of [[0, 720], [480, 480], [720, 480]]) {
      expectIssue(() => insertChord(first.score, { measureIndex: 0, offsetTicks: offsetTicks! }, 'G', duration!, () => 'other'), 'occupied');
    }
    expect(first.score.measures[0]!.chords).toHaveLength(1);
  });
  it('rejects barline crossing without truncating duration or creating a new measure', () => {
    const score = blankScore();
    expectIssue(() => insertChord(score, { measureIndex: 0, offsetTicks: 1440 }, 'C', 960, ids()), 'barline');
    expect(score.measures).toHaveLength(1);
    expect(score.measures[0]!.chords).toEqual([]);
  });
  it('allows replacement to shrink or grow only inside existing free space', () => {
    const factory = ids();
    const first = insertChord(scoreWithMelody(), { measureIndex: 0, offsetTicks: 0 }, 'C', 480, factory);
    const second = insertChord(first.score, { measureIndex: 0, offsetTicks: 1440 }, 'G', 480, factory);
    const replaced = replaceChord(second.score, first.eventId, 'Cm7', 1440);
    expect(replaced.eventId).toBe(first.eventId);
    expect(replaced.position).toEqual({ measureIndex: 0, offsetTicks: 1440 });
    expect(findChord(replaced.score, first.eventId)?.event).toMatchObject({ symbol: 'Cm7', durationTicks: 1440 });
    expect(findChord(second.score, first.eventId)?.event).toMatchObject({ symbol: 'C', durationTicks: 480 });
    expect(findChord(replaced.score, second.eventId)?.event).toBe(findChord(second.score, second.eventId)?.event);
    expectIssue(() => replaceChord(second.score, first.eventId, 'Cmaj7', 1920), 'occupied');
    expectIssue(() => replaceChord(second.score, second.eventId, 'G7', 960), 'barline');
    const shorter = replaceChord(replaced.score, first.eventId, 'C', 240);
    expect(shorter.score.measures[0]!.chords[1]!.offsetTicks).toBe(1440);
    expect(shorter.score.measures.map(measure => measure.melody)).toEqual(second.score.measures.map(measure => measure.melody));
  });
  it('deletes by ID without moving surviving events, deleting a bar or touching its melody', () => {
    const factory = ids();
    const first = insertChord(scoreWithMelody(), { measureIndex: 0, offsetTicks: 0 }, 'C', 480, factory);
    const second = insertChord(first.score, { measureIndex: 0, offsetTicks: 960 }, 'G', 960, factory);
    const result = deleteChord(second.score, first.eventId);
    expect(findChord(result, first.eventId)).toBeNull();
    expect(findChord(result, second.eventId)).toEqual({ position: { measureIndex: 0, offsetTicks: 960 }, event: second.score.measures[0]!.chords[1] });
    expect(result.measures.map(measure => measure.melody)).toEqual(second.score.measures.map(measure => measure.melody));
    expect(deleteChord(result, second.eventId).measures).toHaveLength(4);
    expect(second.score.measures[0]!.chords).toHaveLength(2);
    expectIssue(() => deleteChord(result, 'missing'), 'missing');
    expectIssue(() => replaceChord(result, 'missing', 'C', 480), 'missing');
  });
  it('allows editing bar 256 but never creates bar 257', () => {
    const score = blankScore(256);
    const result = insertChord(score, { measureIndex: 255, offsetTicks: 0 }, 'C', 1920, ids());
    expect(result.position).toEqual({ measureIndex: 256, offsetTicks: 0 });
    expectIssue(() => insertChord(result.score, result.position, 'G', 1920, () => 'new-chord'), 'limit');
    expect(replaceChord(result.score, result.eventId, 'Cm', 960).score.measures).toHaveLength(256);
    expect(deleteChord(result.score, result.eventId).measures).toHaveLength(256);
  });
  it('rejects invalid durations and positions without coercing them', () => {
    for (const duration of [1, 120, 360, 1000, 2880, NaN, Infinity]) {
      expectIssue(() => insertChord(blankScore(), { measureIndex: 0, offsetTicks: 0 }, 'C', duration, ids()), 'duration');
    }
    for (const position of [{ measureIndex: -1, offsetTicks: 0 }, { measureIndex: 0.5, offsetTicks: 0 },
      { measureIndex: 2, offsetTicks: 0 }, { measureIndex: 0, offsetTicks: -1 },
      { measureIndex: 0, offsetTicks: 1920 }, { measureIndex: 0, offsetTicks: 0.5 },
      { measureIndex: NaN, offsetTicks: 0 }, { measureIndex: 0, offsetTicks: Infinity }] satisfies ChordPosition[]) {
      expectIssue(() => insertChord(blankScore(), position, 'C', 480, ids()), 'position');
    }
  });
  it('preserves printable custom notation as data and counts Unicode codepoints', () => {
    for (const symbol of ['N.C.', 'iiø7/V', 'F♯m7', 'CΔ7', '<b>C</b>', '🎹'.repeat(32)]) {
      expect(insertChord(blankScore(), { measureIndex: 0, offsetTicks: 0 }, symbol, 480, ids()).score.measures[0]!.chords[0]!.symbol).toBe(symbol);
    }
    for (const symbol of ['', ' ', ' C', 'C ', 'C\n7', 'C\u00007', 'C\u202e7', 'C\u20287', '\ud800', '🎹'.repeat(33)]) {
      expectIssue(() => insertChord(blankScore(), { measureIndex: 0, offsetTicks: 0 }, symbol, 480, ids()), 'symbol');
    }
  });
  it('rejects malformed IDs and collisions across the sheet and both lanes', () => {
    const score = scoreWithMelody();
    const collisionIds = [score.id, score.measures[0]!.id, score.measures[0]!.melody[0]!.id];
    for (const id of ['', 'white space', 'bad\n', 'a'.repeat(65), ...collisionIds]) {
      expectIssue(() => insertChord(score, { measureIndex: 0, offsetTicks: 0 }, 'C', 480, () => id), 'id');
    }
    expectIssue(() => insertChord(blankScore(), { measureIndex: 1, offsetTicks: 0 }, 'C', 480, () => 'duplicate'), 'id');
    expect(score.measures[0]!.chords).toEqual([]);
  });
});
