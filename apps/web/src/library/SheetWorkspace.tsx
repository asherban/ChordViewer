import { useState } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import { MidiMonitor } from "../midi/MidiMonitor";
import { ScorePreview } from "../score/ScorePreview";
import type { SavedSheet } from "./api";
import { SheetDetails } from "./SheetDetails";

export function SheetWorkspace({
  score,
  saved,
  busy,
  conflict,
  onDirty,
  onSave,
  onReload,
}: {
  score: LeadSheet;
  saved: SavedSheet | null;
  busy: boolean;
  conflict: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (title: string, tutorialUrl: string | null) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [melody, setMelody] = useState(true);
  return (
    <>
      <div className="preview-notice">
        <span>{saved ? "SAVED SHEET" : "EXAMPLE"}</span>
        {saved
          ? "Titles and tutorial links can be saved. Music editing and practice advancement arrive in later milestones."
          : "This original example is a preview. It is not in your library unless you explicitly save a copy."}
      </div>
      {saved && (
        <SheetDetails
          key={saved.revision}
          saved={saved}
          busy={busy}
          conflict={conflict}
          onDirty={onDirty}
          onSave={onSave}
          onReload={onReload}
        />
      )}
      <div className="workspace">
        <aside>
          <section className="tutorial-card">
            <div className="eyebrow">LEARN ALONGSIDE YOUR SHEET</div>
            <div className="video-placeholder">
              <span aria-hidden="true">▷</span>
              <p>
                {saved?.tutorialUrl
                  ? "Your tutorial is linked"
                  : "Your tutorial belongs here"}
              </p>
            </div>
            <h2>Keep the lesson close</h2>
            {saved?.tutorialUrl ? (
              <a
                className="tutorial-link"
                href={saved.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open tutorial on YouTube ↗
              </a>
            ) : (
              <p className="small">
                {saved
                  ? "Add a YouTube video link in the sheet details."
                  : "Save a sheet to add your own YouTube tutorial link."}
              </p>
            )}
            <p className="small">
              The video opens in a new tab. Embedded playback arrives later.
            </p>
          </section>
          <MidiMonitor />
        </aside>
        <section className="sheet-panel" aria-label="Score preview">
          <div className="sheet-toolbar">
            <span className="eyebrow">
              {saved ? "YOUR LEAD SHEET" : "SCORE PREVIEW"}
            </span>
            <div className="segmented" aria-label="Score display">
              <button aria-pressed={melody} onClick={() => setMelody(true)}>
                Chords + melody
              </button>
              <button aria-pressed={!melody} onClick={() => setMelody(false)}>
                Chords only
              </button>
            </div>
          </div>
          <div className="sheet-title">
            <h2>{score.title}</h2>
            <p>
              {saved
                ? `Saved · revision ${saved.revision}`
                : "Original example"}
              <span>·</span>C major<span>·</span>4/4
            </p>
          </div>
          <ScorePreview score={score} melody={melody} />
          <footer className="sheet-footer">
            <span>{score.measures.length} measures</span>
            <span>Single melody voice · treble clef</span>
          </footer>
        </section>
      </div>
    </>
  );
}
