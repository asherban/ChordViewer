import { buildEmbedUrl } from '../lib/youtube';
import { ChordHistory } from './ChordHistory';
import type { ChordHistoryEntry } from '../lib/useChordHistory';
import type { Notation } from '../lib/notation';

interface Props {
  videoId: string;
  startSec: number | null;
  history: ChordHistoryEntry[];
  notation: Notation;
}

export function YouTubePanel({ videoId, startSec, history, notation }: Props) {
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
    </aside>
  );
}
