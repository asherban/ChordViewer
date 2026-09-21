import { useId, useState } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import { MidiMonitor } from "../midi/MidiMonitor";
import type { MidiInputModel } from "../midi/useMidiInput";
import { ScorePreview } from "../score/ScorePreview";
import type { SavedSheet } from "./api";
import { SheetDetails } from "./SheetDetails";

export function SheetWorkspace({
  score, saved, mode, midi, busy, conflict, onDirty, onSave, onReload, onSaveExample, canCreate,
}: {
  score: LeadSheet; saved: SavedSheet | null; mode: "Create" | "Practice"; midi: MidiInputModel;
  busy: boolean; conflict: boolean; onDirty: (dirty: boolean) => void;
  onSave: (title: string, tutorialUrl: string | null) => Promise<void>;
  onReload: () => Promise<void>; onSaveExample?: () => void; canCreate: boolean;
}) {
  const [melody, setMelody] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  return (
    <div className="sheet-workspace">
      <div className="view-toolbar workspace-toolbar">
        <div className="view-title">
          <h1>{mode === "Practice" ? "Practice" : "Your lead sheet"}</h1>
          <span className="workspace-label">{saved ? "Saved · revision " + saved.revision : "Example preview"}</span>
        </div>
        <div className="actions">
          {saved && mode === "Create" && <button className="secondary"
            aria-expanded={detailsOpen} aria-controls={detailsId}
            onClick={() => setDetailsOpen(!detailsOpen)}>Sheet details</button>}
          {onSaveExample && <button className="secondary" disabled={busy || !canCreate}
            onClick={onSaveExample}>Save an example copy to my library</button>}
        </div>
      </div>
      {saved && <div id={detailsId} className="details-drawer" hidden={!detailsOpen || mode === "Practice"}>
        <SheetDetails key={saved.revision} saved={saved} busy={busy} conflict={conflict}
          onDirty={onDirty} onSave={onSave} onReload={onReload} />
      </div>}
      <div className="preview-notice">
        <span>{mode === "Practice" ? "READ ONLY" : saved ? "SAVED SHEET" : "EXAMPLE"}</span>
        {saved
          ? mode === "Practice" ? "Play along with your sheet. Practice navigation is coming next."
            : "Edit the title and tutorial in Sheet details. MIDI note entry is coming next."
          : "This original example is a preview. It is not in your library unless you explicitly save a copy."}
      </div>
      <div className="workspace">
        <aside aria-label="Tutorial and MIDI">
          <section className="tutorial-card">
            <div className="panel-heading"><h2>Tutorial</h2><span className="small">{saved?.tutorialUrl ? "Linked" : "No video"}</span></div>
            <div className="video-placeholder" aria-hidden="true"><span>▷</span></div>
            {saved?.tutorialUrl ? (
              <a className="tutorial-link" href={saved.tutorialUrl} target="_blank" rel="noopener noreferrer">Open tutorial on YouTube ↗</a>
            ) : <p className="small">{saved ? "Add a YouTube link in Sheet details." : "Save a sheet to link your tutorial."}</p>}
            <p className="small video-note">Opens in a separate tab.</p>
          </section>
          <MidiMonitor midi={midi} />
        </aside>
        <section className="sheet-panel" aria-label="Score preview">
          <div className="sheet-toolbar">
            <span className="small">C major · 4/4</span>
            <div className="segmented" aria-label="Score display">
              <button aria-pressed={melody} onClick={() => setMelody(true)}>Chords + melody</button>
              <button aria-pressed={!melody} onClick={() => setMelody(false)}>Chords only</button>
            </div>
          </div>
          <div className="sheet-body" tabIndex={0} aria-label="Scrollable lead sheet">
            <div className="sheet-title"><h2>{score.title}</h2><p>{saved ? "Your lead sheet" : "Original example"} · C major · 4/4</p></div>
            <ScorePreview score={score} melody={melody} />
          </div>
          <footer className="sheet-footer"><span>{score.measures.length} measures</span><span>Single melody voice · treble clef</span></footer>
        </section>
      </div>
    </div>
  );
}
