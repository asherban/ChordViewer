import vocabulary from '../fixtures/chord-vocabulary-v1.json' with { type: 'json' };
import { parseScore, measureTicks, type ChordEvent, type LeadSheet } from './index.js';

export const CHORD_DURATIONS = [240, 480, 720, 960, 1440, 1920] as const;
export type ChordDuration = typeof CHORD_DURATIONS[number];
export interface ChordPosition { measureIndex: number; offsetTicks: number }
export interface ChordEdit { score: LeadSheet; position: ChordPosition; eventId: string }
export interface LocatedChord { event: ChordEvent; position: ChordPosition }
export type ChordEntryIssue = 'position' | 'duration' | 'symbol' | 'occupied' | 'barline' | 'limit' | 'missing' | 'id';
export class ChordEntryError extends Error {
  constructor(readonly code: ChordEntryIssue, message: string) {
    super(message);
    this.name = 'ChordEntryError';
  }
}

function validateEntry(score: LeadSheet, symbol: string, duration: number): void {
  if (!(CHORD_DURATIONS as readonly number[]).includes(duration) && duration !== measureTicks(score)) {
    throw new ChordEntryError('duration', 'Choose an eighth, quarter, dotted quarter, half, dotted half or whole note duration.');
  }
  if (typeof symbol !== 'string' || symbol.trim() !== symbol || [...symbol].length < 1 || [...symbol].length > 32
    || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(symbol)) {
    throw new ChordEntryError('symbol', 'Enter a trimmed, printable chord symbol of 1 to 32 characters.');
  }
}

function validatePosition(score: LeadSheet, position: ChordPosition): void {
  if (!Number.isInteger(position.measureIndex) || position.measureIndex < 0 || position.measureIndex > score.measures.length
    || !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= measureTicks(score)) {
    throw new ChordEntryError('position', 'Select a position in the sheet or its next bar.');
  }
}

function assertAvailable(score: LeadSheet, position: ChordPosition, duration: number, replacingId?: string): void {
  const end = position.offsetTicks + duration;
  if (end > measureTicks(score)) {
    throw new ChordEntryError('barline', 'This duration crosses the barline. Choose a shorter duration or another position.');
  }
  if (score.measures[position.measureIndex]?.chords.some(event => event.id !== replacingId
    && event.offsetTicks < end && event.offsetTicks + event.durationTicks > position.offsetTicks)) {
    throw new ChordEntryError('occupied', 'There is already a chord in this slot. Select it to replace or delete it.');
  }
}

function after(score: LeadSheet, position: ChordPosition, duration: number): ChordPosition {
  const offsetTicks = position.offsetTicks + duration;
  return offsetTicks === measureTicks(score)
    ? { measureIndex: position.measureIndex + 1, offsetTicks: 0 }
    : { measureIndex: position.measureIndex, offsetTicks };
}

function newId(idFactory: () => string, used: Set<string>): string {
  const id = idFactory();
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(id) || used.has(id)) {
    throw new ChordEntryError('id', 'A new chord or bar must have a unique valid ID.');
  }
  used.add(id);
  return id;
}

/** Chord lookup preserves the event's stored spelling and duration. */
export function findChord(score: LeadSheet, eventId: string): LocatedChord | null {
  for (const [measureIndex, measure] of score.measures.entries()) {
    const event = measure.chords.find(chord => chord.id === eventId);
    if (event) return { event, position: { measureIndex, offsetTicks: event.offsetTicks } };
  }
  return null;
}

/** Inserts only into free space. The factory is called for the chord, then for a new bar if needed. */
export function insertChord(score: LeadSheet, position: ChordPosition, symbol: string, duration: number,
  idFactory: () => string): ChordEdit {
  parseScore(score);
  validateEntry(score, symbol, duration);
  validatePosition(score, position);
  assertAvailable(score, position, duration);
  if (position.measureIndex === score.measures.length && score.measures.length >= 256) {
    throw new ChordEntryError('limit', 'This sheet has reached the 256-bar limit.');
  }
  const used = new Set([score.id, ...score.measures.flatMap(measure => [measure.id,
    ...measure.chords.map(event => event.id), ...measure.melody.map(event => event.id)])]);
  const eventId = newId(idFactory, used);
  const event: ChordEvent = { id: eventId, offsetTicks: position.offsetTicks, durationTicks: duration, symbol };
  const measures = [...score.measures];
  if (position.measureIndex === measures.length) {
    measures.push({ id: newId(idFactory, used), chords: [event], melody: [] });
  } else {
    const measure = measures[position.measureIndex]!;
    measures[position.measureIndex] = { ...measure, chords: [...measure.chords, event].sort((a, b) => a.offsetTicks - b.offsetTicks) };
  }
  return { score: parseScore({ ...score, measures }), position: after(score, position, duration), eventId };
}

/** Replaces an existing chord in place without moving or silently shortening its neighbours. */
export function replaceChord(score: LeadSheet, eventId: string, symbol: string, duration: number): ChordEdit {
  parseScore(score);
  validateEntry(score, symbol, duration);
  const found = findChord(score, eventId);
  if (!found) throw new ChordEntryError('missing', 'This chord no longer exists. Select another slot.');
  assertAvailable(score, found.position, duration, eventId);
  const measures = [...score.measures];
  const measure = measures[found.position.measureIndex]!;
  measures[found.position.measureIndex] = { ...measure,
    chords: measure.chords.map(event => event.id === eventId ? { ...event, symbol, durationTicks: duration } : event) };
  return { score: parseScore({ ...score, measures }), position: after(score, found.position, duration), eventId };
}

/** Leaves a gap and retains the bar, melody and IDs of every surviving event. */
export function deleteChord(score: LeadSheet, eventId: string): LeadSheet {
  parseScore(score);
  const found = findChord(score, eventId);
  if (!found) throw new ChordEntryError('missing', 'This chord no longer exists. Select another slot.');
  return parseScore({ ...score, measures: score.measures.map((measure, index) => index === found.position.measureIndex
    ? { ...measure, chords: measure.chords.filter(event => event.id !== eventId) } : measure) });
}

/** A physical-key gesture detector. Feed every ordered raw MIDI message, including while disarmed. */
export class ChordCapture {
  private physical = new Set<number>();
  private pitches = new Set<number>();
  private armed = false;
  private waitingForRelease = false;

  get enabled(): boolean { return this.armed; }
  get heldIds(): number[] { return [...this.physical].sort((a, b) => a - b); }
  get candidatePitches(): number[] { return [...this.pitches].sort((a, b) => a - b); }

  setEnabled(enabled: boolean): void {
    this.armed = enabled;
    this.pitches.clear();
    this.waitingForRelease = this.physical.size > 0;
  }

  /** Attach/reconnect from a known snapshot without converting already-held notes into a new gesture. */
  reset(heldIds: readonly number[] = []): void {
    this.armed = false;
    this.pitches.clear();
    this.physical = new Set(heldIds.filter(id => Number.isInteger(id) && id >= 0 && id < 2048));
    this.waitingForRelease = this.physical.size > 0;
  }

  receive(bytes: ArrayLike<number>): number[] | null {
    if (bytes.length !== 3) return null;
    const status = bytes[0]!;
    const data1 = bytes[1]!;
    const data2 = bytes[2]!;
    if (!Number.isInteger(status) || status < 0x80 || status > 0xef
      || !Number.isInteger(data1) || data1 < 0 || data1 > 127
      || !Number.isInteger(data2) || data2 < 0 || data2 > 127) return null;
    const command = status & 0xf0;
    const channel = status & 0x0f;
    const id = channel * 128 + data1;
    if (command === 0xb0 && (data1 === 120 || data1 >= 123)) {
      for (const held of this.physical) if (Math.floor(held / 128) === channel) this.physical.delete(held);
      this.pitches.clear();
      this.waitingForRelease = this.physical.size > 0;
      return null;
    }
    if (command === 0x90 && data2 > 0) {
      this.physical.add(id);
      if (this.armed && !this.waitingForRelease) this.pitches.add(data1);
    } else if (command === 0x80 || command === 0x90) {
      const wasHeld = this.physical.delete(id);
      if (wasHeld && this.physical.size === 0) {
        const result = this.armed && !this.waitingForRelease && this.pitches.size > 0 ? this.candidatePitches : null;
        this.pitches.clear();
        this.waitingForRelease = false;
        return result;
      }
    }
    return null;
  }
}

export interface ChordCandidate {
  symbol: string;
  rootPitchClass: number;
  quality: string;
  bassPitchClass: number;
}
export interface ChordRecognition { pitchClasses: number[]; bassMidi: number | null; candidates: ChordCandidate[] }

/** Exact set matching keeps unknown voicings available for explicit naming instead of inventing a chord. */
export function recognizeChord(midiNotes: readonly number[]): ChordRecognition {
  if (midiNotes.some(note => !Number.isInteger(note) || note < 0 || note > 127)) {
    throw new RangeError('Chord recognition requires integer MIDI notes from 0 to 127.');
  }
  const pitchClasses = [...new Set(midiNotes.map(note => note % 12))].sort((a, b) => a - b);
  const bassMidi = midiNotes.length > 0 ? midiNotes.reduce((lowest, note) => Math.min(lowest, note), 127) : null;
  if (pitchClasses.length < 2 || bassMidi === null) return { pitchClasses, bassMidi, candidates: [] };
  const bassPitchClass = bassMidi % 12;
  const matches: { root: number; index: number; suffix: string; quality: string }[] = [];
  for (let root = 0; root < 12; root += 1) {
    const intervals = pitchClasses.map(pitch => (pitch - root + 12) % 12);
    for (const [index, entry] of vocabulary.entries.entries()) {
      const optional: readonly number[] = entry.optionalIntervals ?? [];
      if (intervals.every(interval => entry.intervals.includes(interval))
        && entry.intervals.every(interval => optional.includes(interval) || intervals.includes(interval))) {
        matches.push({ root, index, suffix: entry.suffix, quality: entry.quality });
      }
    }
  }
  matches.sort((a, b) => Number(b.root === bassPitchClass) - Number(a.root === bassPitchClass) || a.index - b.index || a.root - b.root);
  const candidates: ChordCandidate[] = [];
  for (const match of matches) {
    const spellings = new Set<string>();
    for (const names of [vocabulary.flatNames, vocabulary.sharpNames]) {
      const symbol = `${names[match.root]}${match.suffix}${match.root === bassPitchClass ? '' : `/${names[bassPitchClass]}`}`;
      if (!spellings.has(symbol)) {
        spellings.add(symbol);
        candidates.push({ symbol, rootPitchClass: match.root, quality: match.quality, bassPitchClass });
      }
    }
  }
  return { pitchClasses, bassMidi, candidates };
}
