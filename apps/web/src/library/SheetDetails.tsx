import { useState, type FormEvent } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import { ScoreSettingsFields } from "../score/ScoreSettingsFields";

export function SheetDetails({ title, tutorial, dirty, busy, conflict, score, onSettings, onChange, onSave }: {
  title: string; tutorial: string; dirty: boolean; busy: boolean; conflict: boolean;
  score: LeadSheet; onSettings: (key: LeadSheet["keySignature"], time: LeadSheet["timeSignature"]) => string | null;
  onChange: (title: string, tutorial: string) => void; onSave: () => Promise<void>;
}) {
  const [settings, setSettings] = useState({ keySignature: score.keySignature, timeSignature: score.timeSignature });
  const [error, setError] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim()) void onSave(); }
  return <form className="sheet-details" aria-label="Sheet details" onSubmit={submit}>
    <label className="field">Sheet title<input value={title} required maxLength={200} disabled={busy}
      onChange={event => onChange(event.target.value, tutorial)} /></label>
    <label className="field">YouTube tutorial link<input type="url" placeholder="https://www.youtube.com/watch?v=…"
      value={tutorial} maxLength={500} disabled={busy} onChange={event => onChange(title, event.target.value)} /></label>
    <div className="actions"><button className="primary" type="submit" disabled={busy || conflict || !dirty || !title.trim()}>
      {busy ? "Saving…" : "Save details"}</button>{dirty && <span className="small">Unsaved changes</span>}</div>
    <div className="sheet-settings">
      <ScoreSettingsFields value={settings} disabled={busy} onChange={setSettings} />
      <div className="actions"><button type="button" className="secondary" disabled={busy || JSON.stringify(settings) === JSON.stringify({ keySignature: score.keySignature, timeSignature: score.timeSignature })}
        onClick={() => setError(onSettings(settings.keySignature, settings.timeSignature) ?? "")}>Apply key and meter</button>
        <span className="small">Written pitches stay unchanged. A shorter bar must still fit every event.</span></div>
      {error && <p role="alert" className="error-message">{error}</p>}
    </div>
  </form>;
}
