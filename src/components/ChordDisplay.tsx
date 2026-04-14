import type { ChordResult } from '../lib/chordDetect';
import { applyNotation, type Notation } from '../lib/notation';

interface Props {
  result: ChordResult;
  notation: Notation;
  onNotationChange: (n: Notation) => void;
}

export function ChordDisplay({ result, notation, onNotationChange }: Props) {
  const { chord, candidates, noteNames } = result;

  const fmt = (name: string) => applyNotation(name, notation);

  // What to show large
  let primaryLabel: string;
  let isEmpty = false;

  if (noteNames.length === 0) {
    primaryLabel = '—';
    isEmpty = true;
  } else if (chord) {
    primaryLabel = fmt(chord);
  } else if (noteNames.length === 1) {
    primaryLabel = noteNames[0];
  } else {
    primaryLabel = '?';
  }

  const alternatives = candidates.slice(1).map(fmt);

  return (
    <div className="chord-display">
      <div className="chord-display__toolbar">
        <div className="notation-toggle" role="group" aria-label="Notation style">
          <button
            className={`notation-toggle__btn${notation === 'regular' ? ' notation-toggle__btn--active' : ''}`}
            onClick={() => onNotationChange('regular')}
          >
            Regular
          </button>
          <button
            className={`notation-toggle__btn${notation === 'jazz' ? ' notation-toggle__btn--active' : ''}`}
            onClick={() => onNotationChange('jazz')}
          >
            Jazz
          </button>
        </div>
      </div>

      <div
        className={`chord-display__name${isEmpty ? ' chord-display__name--empty' : ''}`}
        aria-live="polite"
        aria-label={isEmpty ? 'No notes held' : `Chord: ${primaryLabel}`}
      >
        {primaryLabel}
      </div>

      <div
        className="chord-display__alternatives"
        style={{ visibility: alternatives.length > 0 ? undefined : 'hidden' }}
      >
        also: {alternatives.join(', ')}
      </div>

      <div
        className="chord-display__notes"
        aria-label="Notes held"
        style={{ visibility: noteNames.length > 0 ? undefined : 'hidden' }}
      >
        {noteNames.map((name) => (
          <span key={name} className="chord-display__pill">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
