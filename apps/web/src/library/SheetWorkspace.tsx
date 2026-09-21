import { useEffect, useId, useMemo, useState } from "react";
import { parseScore, type LeadSheet } from "@chordviewer/contracts";
import { MidiMonitor } from "../midi/MidiMonitor";
import type { MidiInputModel } from "../midi/useMidiInput";
import { ScorePreview } from "../score/ScorePreview";
import type { SavedSheet } from "./api";
import { SheetDetails } from "./SheetDetails";
import { useScoreDraft } from "../editor/useScoreDraft";
import { ScoreEntryControls } from "../editor/ScoreEditor";
import { settingsLabel } from "../score/labels";
import { MAX_IMPORT_BYTES } from "../import/score-import";

export function SheetWorkspace({
  score, saved, mode, active, blocked, midi, busy, conflict, onDirty, onSave, onReload, onSaveExample, canCreate,
}: {
  score: LeadSheet; saved: SavedSheet | null; mode: "Create" | "Practice"; midi: MidiInputModel;
  active: boolean; blocked: boolean;
  busy: boolean; conflict: boolean; onDirty: (dirty: boolean) => void;
  onSave: (title: string, tutorialUrl: string | null, score: LeadSheet) => Promise<void>;
  onReload: () => Promise<void>; onSaveExample?: () => void; canCreate: boolean;
}) {
  const [melody, setMelody] = useState(() => !saved || score.measures.some(measure => measure.melody.length > 0));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const detailsId = useId();
  const { model, view } = useScoreDraft(score, saved, midi, !!saved && active && mode === "Create" && !busy, blocked || detailsOpen);
  const displayedScore = useMemo(() => ({ ...view.score, title: view.title }), [view.score, view.title]);
  const save = async () => { model.pause(); await onSave(view.title.trim(), view.tutorial.trim() || null, view.score); };
  const showMelody = melody || mode === "Create" && view.lane === "melody";
  function exportScore() {
    model.pause();
    const current = parseScore({ ...view.score, title: view.title.trim() });
    const blob = new Blob([JSON.stringify(current)], { type: "application/json" });
    if (blob.size > MAX_IMPORT_BYTES) { setExportError("The exported score exceeds the 1 MiB import limit."); return; }
    setExportError("");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `ChordViewer-${current.id}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => { onDirty(view.dirty); }, [onDirty, view.dirty]);
  useEffect(() => {
    if (!view.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view.dirty]);
  useEffect(() => {
    if (!active || mode !== "Create" || busy || blocked || detailsOpen) return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) model.redo(); else model.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); model.redo(); }
      else if (event.key === "Delete" && model.getSnapshot().selectedId) { event.preventDefault(); model.deleteSelected(); }
      else if (event.key === "Escape") model.pause();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [active, mode, busy, blocked, detailsOpen, model]);
  return (
    <div className="sheet-workspace">
      {(!saved || mode === "Create") && <div className="view-toolbar workspace-toolbar">
        <div className="view-title">
          <h1>{mode === "Practice" ? "Practice" : "Your lead sheet"}</h1>
          <span className="workspace-label">{saved ? view.dirty ? "Unsaved changes" : "Saved · revision " + saved.revision : "Example preview"}</span>
        </div>
        <div className="actions">
          {saved && mode === "Create" && <button className="primary" disabled={busy || conflict || !view.dirty || !view.title.trim()}
            onClick={() => void save()}>{busy ? "Saving…" : "Save sheet"}</button>}
          {saved && mode === "Create" && <button className="secondary"
            aria-expanded={detailsOpen} aria-controls={detailsId}
            onClick={() => { model.pause(); setDetailsOpen(!detailsOpen); }}>Sheet details</button>}
          {onSaveExample && <button className="secondary" disabled={busy || !canCreate}
            onClick={onSaveExample}>Save an example copy to my library</button>}
        </div>
      </div>}
      {saved && <div id={detailsId} className="details-drawer" hidden={!detailsOpen || mode === "Practice"}>
        <SheetDetails key={`${view.score.keySignature}:${view.score.timeSignature.numerator}/${view.score.timeSignature.denominator}`} title={view.title} tutorial={view.tutorial} dirty={view.dirty} busy={busy} conflict={conflict} score={view.score}
          onSettings={(key, time) => model.settings(key, time) ? null : model.getSnapshot().notice}
          onChange={(title, tutorial) => model.details(title, tutorial)} onSave={save} />
      </div>}
      {conflict && <div className="conflict-notice" role="status"><p>A newer version is available. Your unsaved score and details are still here.
        Reloading discards them only after confirmation.</p><button className="secondary" disabled={busy} onClick={() => void onReload()}>Reload latest version</button></div>}
      {!saved && <div className="preview-notice">
        <span>EXAMPLE</span>
        This original example is a preview. It is not in your library unless you explicitly save a copy.
      </div>}
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
            <div className="sheet-title"><h2>{view.title}</h2><p>{settingsLabel(view.score)} · {saved
              ? view.dirty ? "Unsaved changes" : `Saved · revision ${saved.revision}` : "Original example"}{mode === "Practice" ? " · Read only" : ""}</p></div>
            <div className="segmented" aria-label="Score display">
              <button aria-pressed={showMelody} onClick={() => setMelody(true)}>Chords + melody</button>
              <button aria-pressed={!showMelody} onClick={() => { model.setLane("chords"); setMelody(false); }}>Chords only</button>
            </div>
            <button className="text-button" disabled={busy || !view.title.trim()} onClick={exportScore}>Export score JSON</button>
          </div>
          {exportError && <p className="error-message" role="alert">{exportError}</p>}
          <div className="sheet-body" tabIndex={0} aria-label="Scrollable lead sheet">
            {saved && mode === "Create" && <ScoreEntryControls model={model} view={view} />}
            <ScorePreview score={displayedScore} melody={showMelody} editing={saved && mode === "Create" ? {
              position: view.position, selectedId: view.selectedId, writable: view.writable, lane: view.lane,
              selectChord: id => model.selectChord(id), selectMelody: id => model.selectMelody(id), selectPosition: position => model.selectPosition(position),
            } : undefined} />
          </div>
          <footer className="sheet-footer"><span>{view.score.measures.length} measures</span><span>{saved && mode === "Create" ? "Ctrl+Z undo · Delete selection · Esc pause" : "Single melody voice · treble clef"}</span></footer>
        </section>
      </div>
    </div>
  );
}
