import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PracticeSession, matchesPracticeChord, parseScore, practiceEvents, supportsPracticeMatch, transposePracticeScore, type LeadSheet } from "@chordviewer/contracts";
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
  score, saved, accountId, mode, active, blocked, midi, busy, conflict, onDirty, onSave, onReload, onSaveExample, onEdit, canCreate,
}: {
  score: LeadSheet; saved: (SavedSheet & { metadataOnly?: boolean }) | null; accountId: string | null;
  mode: "Create" | "Practice"; midi: MidiInputModel;
  active: boolean; blocked: boolean;
  busy: boolean; conflict: boolean; onDirty: (dirty: boolean) => void;
  onSave: (title: string, tutorialUrl: string | null, score: LeadSheet) => Promise<void>;
  onReload: () => Promise<void>; onSaveExample?: () => void; canCreate: boolean;
  onEdit: () => void;
}) {
  const [melody, setMelody] = useState(() => !saved || score.measures.some(measure => measure.melody.length > 0));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [size, setSize] = useState(100);
  const [transpose, setTranspose] = useState(0);
  const [transposeError, setTransposeError] = useState("");
  const [showTutorial, setShowTutorial] = useState(true);
  const detailsId = useId();
  const { model, view } = useScoreDraft(score, saved, midi, !!saved && active && mode === "Create" && !busy, blocked || detailsOpen);
  const displayedScore = useMemo(() => ({ ...view.score, title: view.title }), [view.score, view.title]);
  const transposed = useMemo(() => {
    try { return { score: transposePracticeScore(displayedScore, transpose), error: "" }; }
    catch (error) { return { score: displayedScore, error: error instanceof Error ? error.message : "This score cannot be transposed." }; }
  }, [displayedScore, transpose]);
  const practiceScore = transposed.score;
  const [practice] = useState(() => new PracticeSession(practiceScore));
  const bookmarkKey = accountId && saved ? `chordviewer-position:${accountId}:${saved.id}` : null;
  const initialBookmark = useRef(false);
  const skipFirstEditBookmark = useRef(true);
  const skipFirstPracticeBookmark = useRef(true);
  const practiceState = useSyncExternalStore(practice.subscribe, practice.getSnapshot);
  const events = practiceEvents(practiceScore);
  const target = events[practiceState.eventIndex];
  const liveMatch = target && midi.snapshot.held.length > 0 ? matchesPracticeChord(target.symbol, midi.snapshot.held.map(id => id % 128)) : null;
  useEffect(() => {
    if (initialBookmark.current || !bookmarkKey) return;
    initialBookmark.current = true;
    try {
      const stored = JSON.parse(sessionStorage.getItem(bookmarkKey) ?? "{}");
      if (stored.edit && Number.isSafeInteger(stored.edit.measureIndex) && Number.isSafeInteger(stored.edit.offsetTicks)) model.restorePosition(stored.edit);
      if (stored.practice && Number.isSafeInteger(stored.practice.bar)) {
        practice.selectBar(stored.practice.bar);
        const index = practiceEvents(practiceScore).findIndex(event => event.id === stored.practice.eventId);
        if (index >= 0) practice.selectEvent(index);
      }
    } catch { /* Private session storage may be unavailable. */ }
  }, [bookmarkKey, model, practiceScore, practice]);
  useEffect(() => {
    if (!bookmarkKey) return;
    if (skipFirstEditBookmark.current) { skipFirstEditBookmark.current = false; return; }
    try {
      const old = JSON.parse(sessionStorage.getItem(bookmarkKey) ?? "{}");
      sessionStorage.setItem(bookmarkKey, JSON.stringify({ ...old, edit: view.position }));
    } catch { /* Position memory is best effort; score data stays in the draft. */ }
  }, [bookmarkKey, view.position]);
  useEffect(() => {
    if (!bookmarkKey) return;
    if (skipFirstPracticeBookmark.current) { skipFirstPracticeBookmark.current = false; return; }
    try {
      const old = JSON.parse(sessionStorage.getItem(bookmarkKey) ?? "{}");
      sessionStorage.setItem(bookmarkKey, JSON.stringify({ ...old, practice: { bar: practiceState.bar, eventId: target?.id ?? null } }));
    } catch { /* Position memory is best effort. */ }
  }, [bookmarkKey, practiceState.bar, target?.id]);
  useEffect(() => { practice.setScore(practiceScore); }, [practiceScore, practice]);
  useEffect(() => {
    if (mode !== "Practice" || !active) { practice.reset(); return; }
    practice.setAdvance("manual");
    practice.reset();
    return () => { practice.reset(); };
  }, [mode, active, practice]);
  const subscribeMidi = midi.subscribe;
  useEffect(() => {
    if (mode !== "Practice" || !active || blocked || busy) {
      practice.reset();
      return;
    }
    // subscribe immediately delivers an ordered reset with the *current* held keys.
    return subscribeMidi(event => {
      if (event.type === "reset") practice.reset(event.held);
      else practice.receive(event.data);
    });
  }, [mode, active, blocked, busy, subscribeMidi, practice]);
  function setShift(value: number) {
    try { transposePracticeScore(displayedScore, value); setTranspose(value); setTransposeError(""); }
    catch (error) { setTransposeError(error instanceof Error ? error.message : "This score cannot be transposed."); }
  }
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
  useEffect(() => {
    if (!active || mode !== "Practice" || busy || blocked) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, iframe, [contenteditable=true], dialog")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); practice.previousBar(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); practice.nextBar(); }
      else if (event.key === "Home") { event.preventDefault(); practice.selectBar(0); }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [active, mode, busy, blocked, practice]);
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
      <div className={`workspace${mode === "Practice" && !showTutorial ? " tutorial-hidden" : ""}`}>
        <aside aria-label="Tutorial and MIDI">
          {(mode !== "Practice" || showTutorial) && 
          <section className="tutorial-card">
            <div className="panel-heading"><h2>Tutorial</h2><span className="small">{saved?.tutorialUrl ? "Linked" : "No video"}</span></div>
            {active && !blocked && !busy ? <TutorialEmbed key={saved?.id ?? "example"} url={saved?.tutorialUrl ?? null} title={view.title} /> :
              <div className="video-placeholder" aria-hidden="true"><span>▷</span></div>}
            {!saved?.tutorialUrl && <p className="small">{saved ? "Add a YouTube link in Sheet details." : "Save a sheet to link your tutorial."}</p>}
            <p className="small video-note">Use the YouTube player's controls for playback and speed. The score moves independently.</p>
          </section>}
          {mode === "Practice" && <section className="practice-feedback">
            <h2>Current chart chord</h2>
            <strong>{target?.symbol ?? "No chord in this bar"}</strong>
            <p>{practiceState.complete ? "Complete. Choose Restart or another bar." :
              target && !supportsPracticeMatch(target.symbol) ? "This symbol needs manual advance." :
              practiceState.lastGesture === "matched" ? "Last gesture matched. Next target is shown above." :
              practiceState.lastGesture === "different" ? "Last gesture did not match." :
              "Play a chord or move manually."}</p>
            <p aria-live="polite">{liveMatch === null ? "Play notes to compare with this chord." : liveMatch ? "Held notes match this chord." : "Held notes differ from this chord."}</p>
          </section>}
          <MidiMonitor midi={midi} />
        </aside>
        <section className={`sheet-panel${mode === "Practice" ? " practice-sheet-panel" : ""}`} aria-label="Score preview">
          <div className="sheet-toolbar">
            <div className="sheet-title"><h2>{view.title}</h2><p>{settingsLabel(mode === "Practice" ? practiceScore : view.score)} · {saved
              ? view.dirty ? "Unsaved changes" : `Saved · revision ${saved.revision}` : "Original example"}{mode === "Practice" ? " · Read only" : ""}</p></div>
            <div className="segmented" aria-label="Score display">
              <button aria-pressed={showMelody} onClick={() => setMelody(true)}>Chords + melody</button>
              <button aria-pressed={!showMelody} onClick={() => setMelody(false)}>Chords only</button>
            </div>
            <button className="text-button" disabled={busy || !view.title.trim()} onClick={exportScore}>Export score JSON</button>
            {saved && mode === "Practice" && <button className="secondary" onClick={() => {
              model.restorePosition(target?.position ?? { measureIndex: practiceState.bar, offsetTicks: 0 });
              onEdit();
            }}>Edit sheet</button>}
          </div>
          {exportError && <p className="error-message" role="alert">{exportError}</p>}
          {mode === "Practice" && <div className="practice-controls">
            <button className="secondary" onClick={() => { practice.previousBar(); }}>Previous bar</button>
            <span>Bar {practiceState.bar + 1} of {practiceScore.measures.length}</span>
            <button className="secondary" onClick={() => { practice.nextBar(); }}>Next bar</button>
            <div className="segmented"><button aria-pressed={practiceState.advance === "manual"} onClick={() => { practice.setAdvance("manual"); }}>Manual</button>
              <button aria-pressed={practiceState.advance === "match"} onClick={() => { practice.setAdvance("match"); }}>On match</button></div>
            <button className="secondary" onClick={() => { practice.selectBar(0); }}>Restart</button>
            <label>Size <button onClick={() => setSize(Math.max(70, size - 10))} aria-label="Smaller score">−</button> {size}% <button onClick={() => setSize(Math.min(150, size + 10))} aria-label="Larger score">＋</button></label>
            <label>Transpose <select value={transposed.error ? 0 : transpose} onChange={event => setShift(Number(event.target.value))}>
              {Array.from({ length: 25 }, (_, index) => index - 12).map(shift => <option key={shift} value={shift}>{shift > 0 ? "+" : ""}{shift}</option>)}
            </select></label>
            <button className="secondary" onClick={() => setShowTutorial(!showTutorial)}>{showTutorial ? "Hide tutorial" : "Show tutorial"}</button>
          </div>}
          {(transposeError || transposed.error) && mode === "Practice" && <p role="alert" className="error-message">{transposeError || transposed.error}</p>}
          {mode === "Practice" && events.filter(event => event.position.measureIndex === practiceState.bar).length > 1 &&
            <div className="practice-events" aria-label="Chords in current bar">{events.map((event, index) => ({ event, index }))
              .filter(item => item.event.position.measureIndex === practiceState.bar).map(({ event, index }) =>
                <button key={event.id} aria-pressed={practiceState.eventIndex === index} onClick={() => { practice.selectEvent(index); }}>
                  {event.symbol} · beat {event.position.offsetTicks * practiceScore.timeSignature.denominator / 1920 + 1}</button>)}</div>}
          <div className="sheet-body" tabIndex={0} aria-label="Scrollable lead sheet">
            {saved && mode === "Create" && <ScoreEntryControls model={model} view={view} />}
            <div style={mode === "Practice" ? { zoom: size / 100 } : undefined}>
            <ScorePreview score={mode === "Practice" ? practiceScore : displayedScore} melody={showMelody} practice={mode === "Practice" ? {
              bar: practiceState.bar, chordId: target?.id ?? null,
              selectBar: bar => { practice.selectBar(bar); },
              selectChord: id => { const index = events.findIndex(event => event.id === id); practice.selectEvent(index); },
            } : undefined} editing={saved && mode === "Create" ? {
              position: view.position, selectedId: view.selectedId, writable: view.writable, lane: view.lane,
              selectChord: id => model.selectChord(id), selectMelody: id => model.selectMelody(id), selectPosition: position => model.selectPosition(position),
            } : undefined} />
            </div>
          </div>
          <footer className="sheet-footer"><span>{view.score.measures.length} measures</span><span>{saved && mode === "Create" ? "Ctrl+Z undo · Delete selection · Esc pause" : "Single melody voice · treble clef"}</span></footer>
        </section>
      </div>
    </div>
  );
}

function TutorialEmbed({ url, title }: { url: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  const videoId = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(url ?? "")?.[1];
  const playerUrl = videoId ? `https://www.youtube.com/embed/${videoId}?playsinline=1` : null;
  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);
  return <>
    {playing && playerUrl ? <iframe className="tutorial-player" title={`YouTube tutorial for ${title}`} src={playerUrl}
      referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen onError={() => setPlaying(false)} /> :
      <div className="video-placeholder" aria-hidden="true"><span>▷</span></div>}
    {url && <div className="tutorial-actions">
      {playerUrl && <button className="primary" onClick={() => setPlaying(!playing)}>{playing ? "Stop video" : "Play tutorial"}</button>}
      <a className="tutorial-link" href={url} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
    </div>}
  </>;
}


