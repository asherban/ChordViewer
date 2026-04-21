import { ChordDisplay } from './ChordDisplay';
import { StaffDisplay } from './StaffDisplay';
import { YouTubePanel } from './YouTubePanel';
import type { ChordResult } from '../lib/chordDetect';
import type { Notation } from '../lib/notation';
import type { ChordHistoryEntry } from '../lib/useChordHistory';

interface Props {
  chordResult: ChordResult;
  activeNotes: Set<number>;
  sustainPedalActive: boolean;
  notation: Notation;
  youtubeVideoId: string | null;
  youtubeStartSec: number | null;
  chordHistory: ChordHistoryEntry[];
}

export function LearnView({
  chordResult,
  activeNotes,
  sustainPedalActive,
  notation,
  youtubeVideoId,
  youtubeStartSec,
  chordHistory,
}: Props) {
  return (
    <div className={`app__content${youtubeVideoId ? ' app__content--split' : ''}`}>
      <div className="app__content__left">
        <ChordDisplay
          result={chordResult}
          notation={notation}
          sustainPedalActive={sustainPedalActive}
        />
        <StaffDisplay activeNotes={activeNotes} />
      </div>
      {youtubeVideoId && (
        <YouTubePanel
          videoId={youtubeVideoId}
          startSec={youtubeStartSec}
          history={chordHistory}
          notation={notation}
        />
      )}
    </div>
  );
}
