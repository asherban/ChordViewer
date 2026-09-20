import { useState } from "react";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { AccountForm } from "./library/AccountForm";
import { NewSheetForm } from "./library/NewSheetForm";
import { SheetWorkspace } from "./library/SheetWorkspace";
import { useLibrary } from "./library/useLibrary";
import type { NewSheet } from "./library/api";

type Mode = "Library" | "Create" | "Practice";
const sample = parseScore(example);

export function App() {
  const library = useLibrary();
  const [mode, setMode] = useState<Mode>("Library");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  function mayLeave() {
    return (
      !library.selected ||
      !editing ||
      window.confirm("Discard the unsaved changes to this sheet?")
    );
  }
  function navigate(destination: Mode) {
    if (destination === "Practice" && library.selected) {
      setMode("Practice");
      return;
    }
    if (!mayLeave()) return;
    setEditing(false);
    if (destination === "Library" || destination === "Create")
      library.closeSheet();
    if (destination === "Create" && library.user) {
      setMode("Library");
      setCreating(true);
      setPreview(false);
    } else {
      setMode(destination);
      setCreating(false);
      setPreview(destination !== "Library");
    }
  }
  async function openSheet(id: string) {
    if (await library.openSheet(id)) {
      setEditing(false);
      setCreating(false);
      setPreview(false);
      setMode("Create");
    }
  }
  async function createSheet(fields: NewSheet) {
    if (await library.createSheet(fields)) {
      setEditing(false);
      setCreating(false);
      setPreview(false);
      setMode("Create");
    }
  }
  async function signOut() {
    if (!mayLeave()) return;
    setMode("Library");
    setCreating(false);
    setPreview(false);
    setEditing(false);
    await library.signOut();
  }
  const viewing = library.user && library.selected;
  const showWorkspace = Boolean(viewing) || (preview && mode !== "Library");
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            if (!library.busy) navigate("Library");
          }}
          aria-label="ChordViewer library"
        >
          <span className="brand-mark" aria-hidden="true">
            ♮
          </span>
          Chord<span>Viewer</span>
        </a>
        <nav aria-label="Main navigation">
          {(["Library", "Create", "Practice"] as const).map((item) => (
            <button
              className={mode === item ? "nav-button active" : "nav-button"}
              aria-current={mode === item ? "page" : undefined}
              key={item}
              disabled={
                library.busy ||
                library.checking ||
                library.authBusy ||
                (item === "Create" &&
                  !!library.user &&
                  (library.sheets === null || library.sheets.length >= 100))
              }
              onClick={() => navigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        {library.user ? (
          <div className="account-menu">
            <span title={library.user.email}>{library.user.name}</span>
            <button className="text-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <span className="build-badge">LOCAL DEVELOPMENT</span>
        )}
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR SPACE TO PLAY</div>
            <h1>
              {mode === "Library"
                ? "Your library"
                : mode === "Create"
                  ? "A place for your next idea"
                  : "Make time for the music"}
            </h1>
            <p>
              {mode === "Library"
                ? "Your lead sheets, ready when you are."
                : "Your sheet, with the piano right beside it."}
            </p>
          </div>
          {library.user && (
            <span className="api-status">
              Personal library · {library.user.email}
            </span>
          )}
        </div>
        {library.error && (
          <div className="error-message" role="alert">
            {library.error}
          </div>
        )}
        {library.message && (
          <p className="success-message" role="status">
            {library.message}
          </p>
        )}
        {library.checking ? (
          <p role="status">Checking your account…</p>
        ) : (
          <>
            {library.signOutPending && (
              <div className="retry-signout">
                <button
                  className="secondary"
                  disabled={library.authBusy}
                  onClick={() => void signOut()}
                >
                  {library.authBusy ? "Signing out…" : "Retry sign out"}
                </button>
              </div>
            )}
            {mode === "Library" && !library.user && (
              <>
                <AccountForm
                  busy={library.authBusy || library.signOutPending}
                  onSubmit={library.authenticate}
                />
                <div className="sample-invitation">
                  <p>Want to try the layout and your MIDI input first?</p>
                  <button
                    className="secondary"
                    onClick={() => navigate("Create")}
                  >
                    Explore the score preview ↗
                  </button>
                </div>
              </>
            )}
            {mode === "Library" && library.user && (
              <>
                <div className="library-toolbar">
                  <p>
                    {library.sheets
                      ? `${library.sheets.length} ${library.sheets.length === 1 ? "sheet" : "sheets"}`
                      : "Your library has not loaded yet."}
                  </p>
                  <div className="actions">
                    <button
                      className="secondary"
                      disabled={library.loadingLibrary || library.busy}
                      onClick={() => void library.loadLibrary()}
                    >
                      {library.loadingLibrary
                        ? "Refreshing…"
                        : "Refresh library"}
                    </button>
                    <button
                      className="primary"
                      disabled={
                        library.busy ||
                        library.sheets === null ||
                        library.sheets.length >= 100
                      }
                      onClick={() => setCreating(true)}
                    >
                      New sheet
                    </button>
                  </div>
                </div>
                {creating && (
                  <NewSheetForm
                    busy={library.busy}
                    onCreate={createSheet}
                    onCancel={() => setCreating(false)}
                  />
                )}
                {library.sheets === null ? (
                  <section className="library-empty" aria-label="Your sheets">
                    <h2>Your library is unavailable</h2>
                    <p>
                      Refresh to load your saved sheets. A connection problem
                      does not mean your library is empty.
                    </p>
                  </section>
                ) : library.sheets.length === 0 ? (
                  <section className="library-empty" aria-label="Your sheets">
                    <div className="empty-staff" aria-hidden="true">
                      <span>♪</span>
                    </div>
                    <div className="eyebrow">A FRESH START</div>
                    <h2>Your first sheet starts here</h2>
                    <p>
                      Your library is empty. Start with a blank sheet or choose
                      a copy of the original example.
                    </p>
                    {!creating && (
                      <button
                        className="primary"
                        onClick={() => setCreating(true)}
                      >
                        Create your first sheet
                      </button>
                    )}
                  </section>
                ) : (
                  <section className="library-grid" aria-label="Your sheets">
                    {library.sheets.map((sheet) => (
                      <article className="library-sheet" key={sheet.id}>
                        <div className="eyebrow">LEAD SHEET</div>
                        <h2>{sheet.title}</h2>
                        <p className="small">
                          {sheet.tutorialUrl
                            ? "YouTube tutorial linked"
                            : "No tutorial linked"}
                        </p>
                        <p className="small">
                          Updated{" "}
                          {new Date(sheet.updatedAt).toLocaleDateString()} ·
                          revision {sheet.revision}
                        </p>
                        <button
                          className="secondary"
                          disabled={library.busy}
                          onClick={() => void openSheet(sheet.id)}
                          aria-label={`Open ${sheet.title}`}
                        >
                          Open sheet ↗
                        </button>
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
            {showWorkspace && (
              <>
                {!viewing && library.user && (
                  <div className="sample-actions">
                    <button
                      className="secondary"
                      disabled={
                        library.busy ||
                        library.sheets === null ||
                        library.sheets.length >= 100
                      }
                      onClick={() =>
                        void createSheet({
                          title: "First Sketch",
                          template: "example",
                        })
                      }
                    >
                      Save an example copy to my library
                    </button>
                  </div>
                )}
                <SheetWorkspace
                  key={viewing ? `${library.user?.id}:${viewing.id}` : "sample"}
                  score={viewing ? viewing.score : sample}
                  saved={viewing || null}
                  busy={library.busy}
                  conflict={library.conflict}
                  onDirty={setEditing}
                  onSave={async (title, tutorial) => {
                    if (await library.saveSheet(title, tutorial))
                      setEditing(false);
                  }}
                  onReload={async () => {
                    if (viewing && mayLeave()) {
                      if (await library.openSheet(viewing.id))
                        setEditing(false);
                    }
                  }}
                />
              </>
            )}
            {!showWorkspace && mode !== "Library" && !library.user && (
              <p>Your session has ended. Return to Library to sign in.</p>
            )}
          </>
        )}
        <footer className="app-footer">
          <span>Made for the moments at your piano.</span>
          <span>Local accounts & saved sheets · M3</span>
        </footer>
      </main>
    </div>
  );
}
