'use client'

import { JazzChord } from './JazzChord';
import type { Notation } from '../lib/notation';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  chord: string;
  size?: Size;
  active?: boolean;
  dim?: boolean;
  notation: Notation;
  onClick?: () => void;
}

const SIZE_MAP: Record<Size, { fs: number; px: number; py: number; r: number }> = {
  sm: { fs: 13, px: 12, py: 6,  r: 999 },
  md: { fs: 15, px: 16, py: 9,  r: 999 },
  lg: { fs: 18, px: 18, py: 11, r: 10  },
};

export function ChordPill({ chord, size = 'md', active = false, dim = false, notation, onClick }: Props) {
  const s = SIZE_MAP[size];
  return (
    <button
      onClick={onClick}
      className={`chord-pill chord-pill--${size}${active ? ' chord-pill--active' : ''}${dim ? ' chord-pill--dim' : ''}`}
      style={{
        fontSize: s.fs,
        padding: `${s.py}px ${s.px}px`,
        borderRadius: s.r,
      }}
    >
      <JazzChord chord={chord} fontSize={s.fs} notation={notation} color={active ? '#fff' : undefined} />
    </button>
  );
}
