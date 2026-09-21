import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import { importScore, MAX_IMPORT_BYTES, ScoreImportError, type ImportedScore } from "./score-import";
import { ScorePreview } from "../score/ScorePreview";
import { settingsLabel } from "../score/labels";

export function ImportSheet({ busy, onImport, onCancel }: {
  busy: boolean; onImport: (score: LeadSheet, title: string, tutorialUrl: string | null) => Promise<void>; onCancel: () => void;
}) {
  const sequence = useRef(0);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportedScore | null>(null);
  const [title, setTitle] = useState("");
  const [tutorial, setTutorial] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { sequence.current++; }, []);
  async function read(file?: File) {
    const request = ++sequence.current;
    setPreview(null); setTitle(""); setError("");
    if (!file) { setReading(false); return; }
    if (file.size > MAX_IMPORT_BYTES) { setError("Choose a score file no larger than 1 MiB."); setReading(false); return; }
    setReading(true);
    try {
      const source = await file.text();
      if (request !== sequence.current) return;
      const result = importScore(source, file.name);
      setPreview(result); setTitle(result.score.title);
    } catch (problem) {
      if (request === sequence.current) setError(problem instanceof ScoreImportError ? problem.message : "The score file could not be read. Choose another file.");
    } finally { if (request === sequence.current) setReading(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy && !reading && preview && title.trim()) await onImport(preview.score, title.trim(), tutorial.trim() || null);
  }
  return <form className="import-sheet" aria-label="Import score" onSubmit={event => void submit(event)}>
    <label className="field">Score file<input type="file" accept=".musicxml,.xml,.json" disabled={busy || reading}
      onChange={event => void read(event.target.files?.[0])} /></label>
    <p className="small">MusicXML (.musicxml or .xml) or ChordViewer score JSON, up to 1 MiB. One treble melody voice with chord symbols. Compressed .mxl and MIDI files are not supported yet.</p>
    {reading && <p role="status">Reading score…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {preview && <>
      <div className="correction-fields">
        <label className="field">Imported sheet title<input value={title} required maxLength={200} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
        <label className="field">YouTube tutorial link<input type="url" value={tutorial} maxLength={500} disabled={busy}
          placeholder="Optional tutorial link" onChange={event => setTutorial(event.target.value)} /></label>
      </div>
      <p>{settingsLabel(preview.score)} · {preview.score.measures.length} bars</p>
      {preview.warnings.length > 0 && <ul className="import-warnings">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      <div className="import-preview" aria-label="Imported score preview">
        <ScorePreview score={{ ...preview.score, title: title || preview.score.title, measures: preview.score.measures.slice(0, 8) }} melody />
      </div>
      {preview.score.measures.length > 8 && <p className="small">Preview shows the first 8 bars. All {preview.score.measures.length} bars will be imported.</p>}
      <p className="small">Save creates a new sheet in your library. The source file and existing sheets stay unchanged.</p>
    </>}
    <div className="actions">
      <button className="primary" disabled={busy || reading || !preview || !title.trim()}>{busy ? "Importing…" : "Save as new sheet"}</button>
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
