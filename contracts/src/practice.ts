import vocabulary from '../fixtures/chord-vocabulary-v1.json' with { type: 'json' };
import { ChordCapture } from './chord-entry.js';
import { midiToPitch, parseScore, SUPPORTED_KEYS, type ChordPosition, type LeadSheet, type Pitch } from './index.js';

export interface PracticeEvent { id: string; symbol: string; position: ChordPosition }
const NATURAL: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod = (value: number) => (value % 12 + 12) % 12;
const rootPattern = /^([A-G](?:#|b)?)(.*)$/;
function pitchClass(name: string): number | null {
  const match = /^([A-G])([#b]?)$/.exec(name);
  if (!match) return null;
  return mod(NATURAL[match[1] as Pitch['step']] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0));
}

export function practiceEvents(score: LeadSheet): PracticeEvent[] {
  return score.measures.flatMap((measure, measureIndex) => measure.chords.map(event =>
    ({ id: event.id, symbol: event.symbol, position: { measureIndex, offsetTicks: event.offsetTicks } })));
}
export function practiceBar(score: LeadSheet, bar: number): number {
  return Number.isFinite(bar) ? Math.max(0, Math.min(score.measures.length - 1, Math.trunc(bar))) : 0;
}
export function firstPracticeEventInBar(score: LeadSheet, bar: number): number {
  const events = practiceEvents(score);
  return events.findIndex(event => event.position.measureIndex === practiceBar(score, bar));
}

function parseChord(symbol: string) {
  const match = rootPattern.exec(symbol);
  if (!match) return null;
  const root = pitchClass(match[1]!);
  if (root === null) return null;
  let suffix = match[2]!;
  let bass: number | null = null;
  if (suffix !== '6/9') {
    const slash = /\/([A-G](?:#|b)?)$/.exec(suffix);
    if (slash) {
      const parsedBass = pitchClass(slash[1]!);
      if (parsedBass === null) return null;
      bass = parsedBass;
      suffix = suffix.slice(0, -slash[0].length);
    }
  }
  const entry = vocabulary.entries.find(item => item.suffix === suffix);
  return entry ? { root, bass, suffix, entry } : null;
}
export function supportsPracticeMatch(symbol: string): boolean { return parseChord(symbol) !== null; }
/** Exact pitch-class identity, with optional chord tones and an explicitly written bass. */
export function matchesPracticeChord(symbol: string, midiNotes: readonly number[]): boolean {
  const chord = parseChord(symbol);
  if (!chord || !midiNotes.length || midiNotes.some(note => !Number.isInteger(note) || note < 0 || note > 127)) return false;
  const pitches = new Set(midiNotes.map(note => mod(note)));
  const optional: readonly number[] = 'optionalIntervals' in chord.entry ? chord.entry.optionalIntervals : [];
  if (chord.bass !== null && mod(Math.min(...midiNotes)) !== chord.bass) return false;
  return [...pitches].every(pitch => pitch === chord.bass || chord.entry.intervals.includes(mod(pitch - chord.root)))
    && chord.entry.intervals.every(interval => optional.includes(interval) || pitches.has(mod(chord.root + interval)));
}
function spell(root: number, key: string): string {
  const preferFlat = key.includes('b') || ['F', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'].includes(key);
  return (preferFlat ? vocabulary.flatNames : vocabulary.sharpNames)[mod(root)]!;
}
function transposeSymbol(symbol: string, semitones: number, key: string): string {
  const chord = parseChord(symbol);
  if (!chord) throw new RangeError(`Cannot transpose unsupported chord “${symbol}”. Use the original key or correct the symbol in Create.`);
  return spell(chord.root + semitones, key) + chord.suffix + (chord.bass === null ? '' : '/' + spell(chord.bass + semitones, key));
}
/** Returns a derived score. The authored score is never changed. */
export function transposePracticeScore(score: LeadSheet, semitones: number): LeadSheet {
  if (!Number.isInteger(semitones) || semitones < -12 || semitones > 12) throw new RangeError('Choose a transposition from −12 to +12 semitones.');
  if (semitones === 0) return score;
  const mode = score.keySignature.endsWith('m') ? 'm' : '';
  const original = score.keySignature.replace(/m$/, '');
  const targetKey = SUPPORTED_KEYS.find(key => key.endsWith('m') === !!mode && pitchClass(key.replace(/m$/, '')) === mod(pitchClass(original)! + semitones));
  if (!targetKey) throw new RangeError('The transposed key is outside supported notation.');
  const measures = score.measures.map(measure => ({
    ...measure,
    chords: measure.chords.map(event => ({ ...event, symbol: transposeSymbol(event.symbol, semitones, targetKey) })),
    melody: measure.melody.map(event => {
      if (event.kind !== 'note') return event;
      const midi = (event.pitch.octave + 1) * 12 + NATURAL[event.pitch.step] + event.pitch.alter + semitones;
      if (midi < 48 || midi > 95) throw new RangeError('A melody note would leave the supported C3–B6 range.');
      return { ...event, pitch: midiToPitch(midi, targetKey) };
    }),
  }));
  return parseScore({ ...score, schemaVersion: 2, keySignature: targetKey, measures });
}

export interface PracticeSnapshot {
  bar: number; eventIndex: number; advance: 'manual' | 'match'; complete: boolean;
  lastGesture: 'matched' | 'different' | 'unsupported' | null;
}
/** Synchronous ordered MIDI handling avoids render batching advancing across repeated chords. */
export class PracticeSession {
  private capture = new ChordCapture();
  private snapshot: PracticeSnapshot = { bar: 0, eventIndex: -1, advance: 'manual', complete: false, lastGesture: null };
  private listeners = new Set<() => void>();
  constructor(private score: LeadSheet) { this.snapshot.eventIndex = firstPracticeEventInBar(score, 0); }
  get state(): PracticeSnapshot { return this.snapshot; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { for (const listener of this.listeners) listener(); }
  private resetGesture() { this.capture.setEnabled(this.snapshot.advance === 'match' && !this.snapshot.complete); }
  setScore(score: LeadSheet) {
    const previousId = practiceEvents(this.score)[this.snapshot.eventIndex]?.id;
    this.score = score;
    const events = practiceEvents(score);
    const bar = practiceBar(score, this.snapshot.bar);
    const retained = events.findIndex(event => event.id === previousId);
    const eventIndex = retained >= 0 ? retained : firstPracticeEventInBar(score, bar);
    this.snapshot = { ...this.snapshot, bar: retained >= 0 ? events[retained]!.position.measureIndex : bar, eventIndex,
      complete: false, lastGesture: null };
    this.resetGesture();
    this.publish();
  }
  setAdvance(advance: 'manual' | 'match') {
    this.snapshot = { ...this.snapshot, advance, complete: false, lastGesture: null };
    this.resetGesture();
    this.publish();
  }
  selectBar(bar: number) {
    const bounded = practiceBar(this.score, bar);
    this.snapshot = { ...this.snapshot, bar: bounded, eventIndex: firstPracticeEventInBar(this.score, bounded), complete: false, lastGesture: null };
    this.resetGesture();
    this.publish();
  }
  selectEvent(index: number) {
    const events = practiceEvents(this.score);
    if (!Number.isSafeInteger(index) || index < 0 || index >= events.length) return;
    this.snapshot = { ...this.snapshot, bar: events[index]!.position.measureIndex, eventIndex: index, complete: false, lastGesture: null };
    this.resetGesture();
    this.publish();
  }
  previousBar() { this.selectBar(this.snapshot.bar - 1); }
  nextBar() { this.selectBar(this.snapshot.bar + 1); }
  reset(held: readonly number[] = []) { this.capture.reset(held); this.resetGesture(); this.snapshot = { ...this.snapshot, lastGesture: null }; this.publish(); }
  receive(bytes: ArrayLike<number>): PracticeSnapshot {
    const notes = this.capture.receive(bytes);
    if (!notes || this.snapshot.advance !== 'match' || this.snapshot.complete) return this.snapshot;
    const events = practiceEvents(this.score);
    const target = events[this.snapshot.eventIndex];
    if (!target) return this.snapshot;
    if (!supportsPracticeMatch(target.symbol)) {
      this.snapshot = { ...this.snapshot, lastGesture: 'unsupported' }; this.publish(); return this.snapshot;
    }
    if (!matchesPracticeChord(target.symbol, notes)) {
      this.snapshot = { ...this.snapshot, lastGesture: 'different' }; this.publish(); return this.snapshot;
    }
    const next = this.snapshot.eventIndex + 1;
    this.snapshot = { ...this.snapshot, lastGesture: 'matched', complete: next >= events.length,
      ...(next < events.length ? { eventIndex: next, bar: events[next]!.position.measureIndex } : {}) };
    if (this.snapshot.complete) this.capture.setEnabled(false);
    this.publish();
    return this.snapshot;
  }
}
