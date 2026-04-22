import { buildEmbedUrl } from '../lib/youtube';
import { ChordHistory } from './ChordHistory';
import { ChordPill } from './ChordPill';
import type { ChordHistoryEntry } from '../lib/useChordHistory';
import type { Notation } from '../lib/notation';

interface Props {
  videoId: string;
  startSec: number | null;
  history: ChordHistoryEntry[];
  notation: Notation;
  onChordTap?: (chord: string) => void;
}

export function YouTubePanel({ videoId, startSec, history, notation, onChordTap }: Props) {
  const recentChords = history.map((e) => e.chord);

  return (
    <aside className="yt-panel" aria-label="Video and recent chords">
      <div className="yt-panel__video">
        <iframe
          src={buildEmbedUrl(videoId, startSec)}
          title="YouTube video"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <ChordHistory history={history} notation={notation} />
      {onChordTap && recentChords.length > 0 && (
        <div className="yt-panel__palette">
          <div className="yt-panel__palette-label">Recent · tap to add</div>
          <div className="yt-panel__palette-pills">
            {recentChords.map((c, i) => (
              <ChordPill
                key={i}
                chord={c}
                size="md"
                active={i === recentChords.length - 1}
                notation={notation}
                onClick={() => onChordTap(c)}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
