import type { ChordResult } from '../lib/chordDetect';
import { applyNotation, type Notation } from '../lib/notation';

interface Props {
  result: ChordResult;
  notation: Notation;
  sustainPedalActive: boolean;
}

export function ChordDisplay({ result, notation, sustainPedalActive }: Props) {
  const { chord, candidates, noteNames } = result;

  const fmt = (name: string) => applyNotation(name, notation);

  let primaryLabel: string;
  let isEmpty = false;

  if (noteNames.length < 2) {
    primaryLabel = '—';
    isEmpty = true;
  } else if (chord) {
    primaryLabel = fmt(chord);
  } else {
    primaryLabel = '?';
  }

  const alternatives = candidates.slice(1).map(fmt);

  return (
    <div className="chord-display">
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
        style={{ visibility: noteNames.length > 0 || sustainPedalActive ? undefined : 'hidden' }}
      >
        {noteNames.map((name) => (
          <span key={name} className="chord-display__pill">
            {name}
          </span>
        ))}
        {sustainPedalActive && (
          <span className="chord-display__sustain-indicator" aria-label="Sustain pedal active">
            Sustain
          </span>
        )}
      </div>
    </div>
  );
}
