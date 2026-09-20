import { useEffect, useState } from "react";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { MidiMonitor } from "./midi/MidiMonitor";
import { ScorePreview } from "./score/ScorePreview";

type Mode = "Library" | "Create" | "Practice";

export function App() {
  const [mode, setMode] = useState<Mode>("Library");
  const [melody, setMelody] = useState(true);
  const [score, setScore] = useState(() => parseScore(example));
  const [api, setApi] = useState("Connecting to local API…");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/score-example", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        const validated = parseScore(await response.json());
        if (!controller.signal.aborted) {
          setScore(validated);
          setApi("Local API connected");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setApi("API unavailable · using bundled example");
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setMode("Library");
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
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <span className="build-badge">LOCAL PREVIEW</span>
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
                : "An early look at your sheet, with the piano right beside it."}
            </p>
          </div>
          <span className="api-status" role="status">
            {api}
          </span>
        </div>
        {mode === "Library" ? (
          <section className="library-empty" aria-label="Your sheets">
            <div className="empty-staff" aria-hidden="true">
              <span>♪</span>
            </div>
            <div className="eyebrow">A FRESH START</div>
            <h2>Your first sheet starts here</h2>
            <p>
              Your library is empty. Sheet creation and saving arrive in the
              next product milestones.
            </p>
            <button className="primary" onClick={() => setMode("Create")}>
              Explore the score preview <span aria-hidden="true">↗</span>
            </button>
            <p className="small">
              The example is for exploring the layout. It is never added to your
              library.
            </p>
          </section>
        ) : (
          <>
            <div className="preview-notice">
              <span>EXAMPLE</span> Preview only · editing, saving and practice
              advancement are coming in later milestones.
            </div>
            <div className="workspace">
              <aside>
                <section className="tutorial-card">
                  <div className="eyebrow">LEARN ALONGSIDE YOUR SHEET</div>
                  <div className="video-placeholder">
                    <span aria-hidden="true">▷</span>
                    <p>Your tutorial belongs here</p>
                  </div>
                  <h2>Keep the lesson close</h2>
                  <p className="small">
                    You’ll be able to link a YouTube tutorial while creating or
                    practicing.
                  </p>
                </section>
                <MidiMonitor />
              </aside>
              <section className="sheet-panel" aria-label="Score preview">
                <div className="sheet-toolbar">
                  <span className="eyebrow">SCORE PREVIEW</span>
                  <div className="segmented" aria-label="Score display">
                    <button
                      aria-pressed={melody}
                      onClick={() => setMelody(true)}
                    >
                      Chords + melody
                    </button>
                    <button
                      aria-pressed={!melody}
                      onClick={() => setMelody(false)}
                    >
                      Chords only
                    </button>
                  </div>
                </div>
                <div className="sheet-title">
                  <h2>{score.title}</h2>
                  <p>
                    Original example <span>·</span> C major <span>·</span> 4/4
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
        )}
        <footer className="app-footer">
          <span>Made for the moments at your piano.</span>
          <span>Foundation preview · M2</span>
        </footer>
      </main>
    </div>
  );
}
