import type { KeySignature, TimeSignature } from './music.js';

export const TICKS_PER_QUARTER = 480;
export const TICKS_PER_MEASURE = 1920;

export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  alter: -1 | 0 | 1;
  octave: 3 | 4 | 5 | 6;
}
export interface NoteDuration { denominator: 1 | 2 | 4 | 8 | 16; dots: 0 | 1 }
export interface ChordEvent { id: string; offsetTicks: number; durationTicks: number; symbol: string }
interface MelodyBase { id: string; offsetTicks: number; duration: NoteDuration }
export interface NoteEvent extends MelodyBase { kind: 'note'; pitch: Pitch; tieToNext?: boolean }
export interface RestEvent extends MelodyBase { kind: 'rest' }
export type MelodyEvent = NoteEvent | RestEvent;
export interface Measure { id: string; chords: ChordEvent[]; melody: MelodyEvent[] }
export interface LeadSheet {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  keySignature: KeySignature;
  timeSignature: TimeSignature;
  ticksPerQuarter: 480;
  measures: Measure[];
}

export function durationTicks(duration: NoteDuration): number {
  return (TICKS_PER_MEASURE / duration.denominator) * (duration.dots === 1 ? 1.5 : 1);
}
export function measureTicks(score: Pick<LeadSheet, 'timeSignature'>): number {
  return score.timeSignature.numerator * TICKS_PER_MEASURE / score.timeSignature.denominator;
}
export function sameSpelledPitch(left: Pitch, right: Pitch): boolean {
  return left.step === right.step && left.alter === right.alter && left.octave === right.octave;
}

