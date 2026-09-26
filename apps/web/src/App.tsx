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
import { RecoveryLibrary } from "./library/RecoveryLibrary";

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
  const [search, setSearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<"All" | "Favorites" | "Drafts" | "Trash">("All");
  const [contentFilter, setContentFilter] = useState<"Any" | "Chords only" | "Melody">("Any");
  const [tutorialOnly, setTutorialOnly] = useState(false);
  const [librarySort, setLibrarySort] = useState<"Recent" | "Title">("Recent");
  function mayLeave() {
    return !library.selected || !editing || window.confirm("Leave this unsaved sheet? Its last confirmed local recovery copy remains on this device.");
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
      void library.touchSheet(id);
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
  async function renameSheet(id: string, oldTitle: string) {
    if (library.selected?.id === id && !mayLeave()) return;
    const title = window.prompt("Rename sheet", oldTitle)?.trim();
    if (title && title !== oldTitle) await library.changeMetadata(id, { title });
  }
  async function trashSheet(id: string) {
    if (library.selected?.id === id && !mayLeave()) return;
    if (await library.transitionSheet(id, "trash") && library.selected?.id === id) setEditing(false);
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
  const activeSheets = library.sheets?.filter(sheet => !sheet.trashedAt) ?? [];
  const visibleSheets = (library.sheets ?? []).filter(sheet => {
    if (libraryFilter === "Trash" && !sheet.trashedAt) return false;
    if (libraryFilter !== "Trash" && (sheet.trashedAt || libraryFilter === "Favorites" && !sheet.favorite || libraryFilter === "Drafts" && !sheet.draft)) return false;
    if (contentFilter === "Chords only" && sheet.hasMelody || contentFilter === "Melody" && !sheet.hasMelody) return false;
    return (!tutorialOnly || !!sheet.tutorialUrl) && sheet.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  }).sort((a, b) => librarySort === "Title" ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id) :
    (Date.parse(b.openedAt ?? b.updatedAt) - Date.parse(a.openedAt ?? a.updatedAt)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
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
                    {activeSheets.length + (activeSheets.length === 1 ? " sheet" : " sheets")}
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
              {library.user && mode === "Library" && <RecoveryLibrary key={library.user.id} accountId={library.user.id} busy={library.busy} onRestore={draft => {
                if (mayLeave() && library.restoreLocal(draft)) { setMode("Create"); setCreating(false); setImporting(false); setPreview(false); }
              }} />}
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
              ) : (<>
                <div className="library-controls">
                  <input aria-label="Search sheets" placeholder="Search sheets" value={search} onChange={event => setSearch(event.target.value)} />
                  <div className="segmented" aria-label="Library filter">{(["All", "Favorites", "Drafts", "Trash"] as const).map(filter =>
                    <button key={filter} aria-pressed={libraryFilter === filter} onClick={() => setLibraryFilter(filter)}>{filter}</button>)}</div>
                  <select aria-label="Notation content" value={contentFilter} onChange={event => setContentFilter(event.target.value as typeof contentFilter)}>
                    <option>Any</option><option>Chords only</option><option>Melody</option>
                  </select>
                  <label className="library-check"><input type="checkbox" checked={tutorialOnly} onChange={event => setTutorialOnly(event.target.checked)} /> Tutorial</label>
                  <select aria-label="Sort sheets" value={librarySort} onChange={event => setLibrarySort(event.target.value as typeof librarySort)}>
                    <option value="Recent">Recently opened</option><option value="Title">Title</option>
                  </select>
                </div>
                {visibleSheets.length === 0 && <section className="library-empty"><h2>{libraryFilter === "Trash" ? "Trash is empty" : "No matching sheets"}</h2>
                  <p>{libraryFilter === "Trash" ? "Sheets moved to Trash appear here until restored." : "Try another search or filter."}</p></section>}
                <section className="library-grid" aria-label="Your sheets">
                  {visibleSheets.map((sheet) => (
                    <article className="library-sheet" key={sheet.id}>
                      <div className="card-topline">
                        <span className="sheet-icon" aria-hidden="true">♩</span>
                        <button className="text-button" disabled={library.busy || !!sheet.trashedAt} aria-label={(sheet.favorite ? "Remove favorite " : "Favorite ") + sheet.title}
                          onClick={() => void library.changeMetadata(sheet.id, { favorite: !sheet.favorite })}>{sheet.favorite ? "★" : "☆"}</button>
                      </div>
                      <div className="card-score-preview" aria-label="First bar chords">{sheet.previewChords.length ? sheet.previewChords.join("  ·  ") : "No chords in first bar"}</div>
                      <h2>{sheet.title}</h2>
                      <p className="sheet-meta">{sheet.keySignature} · {sheet.timeSignature.numerator}/{sheet.timeSignature.denominator}</p>
                      <div className="card-tags"><span className="tag">{sheet.hasMelody ? sheet.hasChords ? "Chords + melody" : "Melody only" : sheet.hasChords ? "Chords only" : "Blank score"}</span>
                        {sheet.tutorialUrl && <span className="tag">Tutorial</span>}
                        {sheet.draft && <span className="tag">Draft</span>}
                        <span className="saved-label"><span className="status-dot connected" />{sheet.trashedAt ? "In Trash" : "Saved"}</span>
                        {viewing?.id === sheet.id && <span className="tag">{editing ? "Unsaved changes" : "Open sheet"}</span>}
                      </div>
                      <p className="small card-updated">Updated {new Date(sheet.updatedAt).toLocaleDateString()} · revision {sheet.revision}</p>
                      <div className="card-actions">
                        {sheet.trashedAt ? <button className="secondary" disabled={library.busy} onClick={() => void library.transitionSheet(sheet.id, "restore")}>Restore</button> : <>
                        <button className="primary" disabled={library.busy} aria-label={"Practice " + sheet.title}
                          onClick={() => void openSheet(sheet.id, "Practice")}><span aria-hidden="true">▷</span> Practice</button>
                        <button className="secondary" disabled={library.busy} aria-label={"Edit " + sheet.title}
                          onClick={() => void openSheet(sheet.id)}>Edit</button></>}
                      </div>
                      {!sheet.trashedAt && <details className="card-more"><summary>More actions</summary>
                        <div className="card-more-actions">
                          <button disabled={library.busy} onClick={() => void renameSheet(sheet.id, sheet.title)}>Rename</button>
                          <button disabled={library.busy || !canCreate} onClick={() => void library.duplicateSheet(sheet.id)}>Duplicate</button>
                          <button disabled={library.busy} onClick={() => void library.changeMetadata(sheet.id, { draft: !sheet.draft })}>{sheet.draft ? "Mark complete" : "Mark draft"}</button>
                          <button disabled={library.busy} onClick={() => void trashSheet(sheet.id)}>Move to Trash</button>
                        </div>
                      </details>}
                    </article>
                  ))}
                </section>
              </>)}
            </div>
            {hasWorkspace && (
              <div className="workspace-container" hidden={!showWorkspace}>
                <SheetWorkspace
                  key={viewing ? library.user?.id + ":" + viewing.id + ":" + library.recoverySelection : "sample"}
                  accountId={library.user?.id ?? null}
                  score={viewing ? viewing.score : sample} saved={viewing || null}
                  mode={mode === "Practice" ? "Practice" : "Create"} midi={midi}
                  active={showWorkspace} blocked={creating || importing}
                  onEdit={() => navigate("Create")}
                  busy={library.busy} conflict={library.conflict} onDirty={setEditing}
                  recovered={library.restored}
                  onSaveCopy={async (title, tutorial, score) => { const saved = await library.importSheet(score, title, tutorial); if (saved) setEditing(false); return saved; }}
                  onSave={async (title, tutorial, score) => {
                    if (await library.saveSheet(title, tutorial, score)) setEditing(false);
                  }}
                  onReload={async () => {
                    if (viewing && window.confirm("Reload the server version? This replaces the current draft and removes its recovery copy after the reload succeeds.") && await library.openSheet(viewing.id)) setEditing(false);
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
