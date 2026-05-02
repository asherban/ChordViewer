'use client'

import { ChordDisplay } from './ChordDisplay';
import { StaffDisplay } from './StaffDisplay';
import type { ChordResult } from '../lib/chordDetect';
import type { Notation } from '../lib/notation';

interface Props {
  chordResult: ChordResult;
  activeNotes: Set<number>;
  sustainPedalActive: boolean;
  notation: Notation;
}

export function LearnView({ chordResult, activeNotes, sustainPedalActive, notation }: Props) {
  return (
    <>
      <ChordDisplay result={chordResult} notation={notation} sustainPedalActive={sustainPedalActive} />
      <StaffDisplay activeNotes={activeNotes} />
    </>
  );
}
