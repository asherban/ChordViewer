import type { ChordResult } from '../lib/chordDetect';

interface Props {
  result: ChordResult;
}

export function ChordDisplay({ result }: Props) {
  const { chord, candidates, noteNames } = result;

  // What to show large
  let primaryLabel: string;
  let isEmpty = false;

  if (noteNames.length === 0) {
    primaryLabel = '—';
    isEmpty = true;
  } else if (chord) {
    primaryLabel = chord;
  } else if (noteNames.length === 1) {
    primaryLabel = noteNames[0];
  } else {
    primaryLabel = '?';
  }

  // Alternative chord names (all candidates after the first)
  const alternatives = candidates.slice(1);

  return (
    <div className="chord-display">
      <div
        className={`chord-display__name${isEmpty ? ' chord-display__name--empty' : ''}`}
        aria-live="polite"
        aria-label={isEmpty ? 'No notes held' : `Chord: ${primaryLabel}`}
      >
        {primaryLabel}
      </div>

      {alternatives.length > 0 && (
        <div className="chord-display__alternatives">
          also: {alternatives.join(', ')}
        </div>
      )}

      {noteNames.length > 0 && (
        <div className="chord-display__notes" aria-label="Notes held">
          {noteNames.map((name) => (
            <span key={name} className="chord-display__pill">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
