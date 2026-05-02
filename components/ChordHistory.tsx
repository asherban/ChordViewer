'use client'

import { applyNotation, type Notation } from '../lib/notation';
import type { ChordHistoryEntry } from '../lib/useChordHistory';

interface Props {
  history: ChordHistoryEntry[];
  notation: Notation;
}

export function ChordHistory({ history, notation }: Props) {
  return (
    <section className="chord-history" aria-label="Last 4 chords played">
      <h2 className="chord-history__title">Last 4 chords</h2>
      {history.length === 0 ? (
        <p className="chord-history__empty">Play chords to build history…</p>
      ) : (
        <ol className="chord-history__list">
          {history.map((entry, i) => (
            <li
              key={entry.id}
              className={`chord-history__item${
                i === history.length - 1 ? ' chord-history__item--current' : ''
              }`}
            >
              {applyNotation(entry.chord, notation)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
