import { useState } from "react";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { AccountForm } from "./library/AccountForm";
import { NewSheetForm } from "./library/NewSheetForm";
import { SheetWorkspace } from "./library/SheetWorkspace";
import { useLibrary } from "./library/useLibrary";
import { useMidiInput } from "./midi/useMidiInput";
import { FullscreenToggle } from "./layout/FullscreenToggle";
import { AppDialog } from "./layout/AppDialog";
import type { NewSheet } from "./library/api";
import type { LeadSheet } from "@chordviewer/contracts";
import { ImportSheet } from "./import/ImportSheet";

type Mode = "Library" | "Create" | "Practice";
const sample = parseScore(example);

export function App() {
  const library = useLibrary();
  const midi = useMidiInput();
  const [mode, setMode] = useState<Mode>("Library");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  function mayLeave() {
    return !library.selected || !editing || window.confirm("Discard the unsaved changes to this sheet?");
  }
  function navigate(destination: Mode) {
    // Switching modes keeps the current workspace mounted, including its draft.
    setMode(destination);
    setCreating(false);
    setImporting(false);
    if (!library.user && destination !== "Library") setPreview(true);
    if (destination === "Create" && library.user && !library.selected && canCreate) setCreating(true);
  }
  async function openSheet(id: string, destination: Mode = "Create") {
    if (library.selected?.id === id) {
      setMode(destination);
      return;
    }
    if (!mayLeave()) return;
    if (await library.openSheet(id)) {
      setEditing(false);
      setCreating(false);
      setPreview(false);
      setMode(destination);
    }
  }
  async function createSheet(fields: NewSheet) {
    if (!mayLeave()) return;
    if (await library.createSheet(fields)) {
      setEditing(false);
      setCreating(false);
      setPreview(false);
      setMode("Create");
    }
  }
  async function importSheet(score: LeadSheet, title: string, tutorialUrl: string | null) {
    if (!mayLeave()) return;
    if (await library.importSheet(score, title, tutorialUrl)) {
      setEditing(false); setCreating(false); setImporting(false); setPreview(false); setMode("Create");
    }
  }
  async function signOut() {
    if (!mayLeave()) return;
    setMode("Library");
    setCreating(false);
    setImporting(false);
    setPreview(false);
    setEditing(false);
    midi.disconnect();
    await library.signOut();
  }
  const viewing = library.user && library.selected;
  const hasWorkspace = Boolean(viewing) || preview;
  const showWorkspace = hasWorkspace && mode !== "Library";
  const canCreate = !library.busy && library.sheets !== null && library.sheets.length < 100;
  const sheetCount = library.sheets?.length;
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" aria-label="ChordViewer library" onClick={(event) => {
          event.preventDefault();
          if (!library.busy) navigate("Library");
        }}>ChordViewer</a>
        <nav aria-label="Main navigation">
          {(["Library", "Create", "Practice"] as const).map((item) => (
            <button className={mode === item ? "nav-button active" : "nav-button"}
              aria-current={mode === item ? "page" : undefined} key={item}
              disabled={library.busy || library.checking || library.authBusy}
              onClick={() => navigate(item)}>{item}</button>
          ))}
        </nav>
        <div className="header-tools">
          <span className="midi-connection" title={midi.selected ? "MIDI input connected" : "Connect MIDI from a sheet"}>
            <span className={midi.selected ? "status-dot connected" : "status-dot"} />
            {midi.selected ? "MIDI connected" : "MIDI off"}
          </span>
          <FullscreenToggle />
          {library.user && (
            <div className="account-menu">
              <span title={library.user.email}>{library.user.name}</span>
              <button className="text-button" onClick={() => void signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        {(library.error || (library.message && !editing) || library.signOutPending) && (
          <div className="app-feedback">
            {library.error && !creating && !importing && <div className="error-message" role="alert">{library.error}</div>}
            {library.message && !editing && <p className="success-message" role="status">{library.message}</p>}
            {library.signOutPending && <button className="secondary" disabled={library.authBusy}
              onClick={() => void signOut()}>{library.authBusy ? "Signing out…" : "Retry sign out"}</button>}
          </div>
        )}
        {library.checking ? <p className="loading-state" role="status">Checking your account…</p> : (
          <>
            <div className="library-view" hidden={showWorkspace}>
              <div className="view-toolbar">
                <div className="view-title">
                  <h1>{mode === "Library" ? "My library" : mode === "Practice" ? "Choose a sheet to practice" : "Create a sheet"}</h1>
                  {library.user && sheetCount !== undefined && <span className="sheet-count">
                    {sheetCount + (sheetCount === 1 ? " sheet" : " sheets")}
                  </span>}
                </div>
                {library.user && <div className="actions">
                  <button className="secondary" disabled={library.loadingLibrary || library.busy}
                    onClick={() => void library.loadLibrary()}>{library.loadingLibrary ? "Refreshing…" : "Refresh library"}</button>
                  <button className="primary" disabled={!canCreate} onClick={() => setCreating(true)}>
                    <span aria-hidden="true">＋</span> New sheet
                  </button>
                  <button className="secondary" disabled={!canCreate} onClick={() => setImporting(true)}>Import score</button>
                </div>}
              </div>
              {library.user && <div className="library-context">
                <span className="small">Personal library · {library.user.email}</span>
                {editing && <span className="draft-badge">Unsaved changes in your open sheet</span>}
              </div>}
              {!library.user ? (
                <div className="account-view">
                  <AccountForm busy={library.authBusy || library.signOutPending} onSubmit={library.authenticate} />
                  <div className="sample-invitation">
                    <span>Try the score and MIDI input without an account.</span>
                    <button className="text-button" onClick={() => navigate("Create")}>Explore the score preview ↗</button>
                  </div>
                </div>
              ) : library.sheets === null ? (
                <section className="library-empty" aria-label="Your sheets">
                  <h2>Your library is unavailable</h2>
                  <p>Refresh to load your saved sheets. A connection problem does not mean your library is empty.</p>
                </section>
              ) : library.sheets.length === 0 ? (
                <section className="library-empty" aria-label="Your sheets">
                  <div className="empty-staff" aria-hidden="true"><span>♪</span></div>
                  <h2>Your first sheet starts here</h2>
                  <p>Start a blank sheet, import a score, or explore the original example.</p>
                  <button className="primary" disabled={!canCreate} onClick={() => setCreating(true)}>Create your first sheet</button>
                </section>
              ) : (
                <section className="library-grid" aria-label="Your sheets">
                  {library.sheets.map((sheet) => (
                    <article className="library-sheet" key={sheet.id}>
                      <div className="card-topline">
                        <span className="sheet-icon" aria-hidden="true">♩</span>
                        <span className="saved-label"><span className="status-dot connected" />Saved</span>
                      </div>
                      <h2>{sheet.title}</h2>
                      <p className="sheet-meta">Lead sheet</p>
                      <div className="card-tags"><span className="tag">{sheet.tutorialUrl ? "Tutorial linked" : "No tutorial"}</span>
                        {viewing?.id === sheet.id && <span className="tag">{editing ? "Unsaved changes" : "Open sheet"}</span>}
                      </div>
                      <p className="small card-updated">Updated {new Date(sheet.updatedAt).toLocaleDateString()} · revision {sheet.revision}</p>
                      <div className="card-actions">
                        <button className="primary" disabled={library.busy} aria-label={"Practice " + sheet.title}
                          onClick={() => void openSheet(sheet.id, "Practice")}><span aria-hidden="true">▷</span> Practice</button>
                        <button className="secondary" disabled={library.busy} aria-label={"Open " + sheet.title}
                          onClick={() => void openSheet(sheet.id)}>Open sheet</button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
            </div>
            {hasWorkspace && (
              <div className="workspace-container" hidden={!showWorkspace}>
                <SheetWorkspace
                  key={viewing ? library.user?.id + ":" + viewing.id : "sample"}
                  score={viewing ? viewing.score : sample} saved={viewing || null}
                  mode={mode === "Practice" ? "Practice" : "Create"} midi={midi}
                  active={showWorkspace} blocked={creating || importing}
                  busy={library.busy} conflict={library.conflict} onDirty={setEditing}
                  onSave={async (title, tutorial, score) => {
                    if (await library.saveSheet(title, tutorial, score)) setEditing(false);
                  }}
                  onReload={async () => {
                    if (viewing && mayLeave() && await library.openSheet(viewing.id)) setEditing(false);
                  }}
                  onSaveExample={library.user && !viewing ? () => void createSheet({ title: "First Sketch", template: "example" }) : undefined}
                  canCreate={canCreate}
                />
              </div>
            )}
            {creating && library.user && <AppDialog title="New sheet" onClose={() => setCreating(false)} busy={library.busy}>
              {library.error && <p className="error-message" role="alert">{library.error}</p>}
              <NewSheetForm busy={library.busy} onCreate={createSheet} onCancel={() => setCreating(false)} />
            </AppDialog>}
            {importing && library.user && <AppDialog title="Import a score" onClose={() => setImporting(false)} busy={library.busy}>
              {library.error && <p className="error-message" role="alert">{library.error}</p>}
              <ImportSheet busy={library.busy} onImport={importSheet} onCancel={() => setImporting(false)} />
            </AppDialog>}
          </>
        )}
      </main>
    </div>
  );
}
