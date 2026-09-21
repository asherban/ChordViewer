import type { FormEvent } from "react";

export function SheetDetails({ title, tutorial, dirty, busy, conflict, onChange, onSave }: {
  title: string; tutorial: string; dirty: boolean; busy: boolean; conflict: boolean;
  onChange: (title: string, tutorial: string) => void; onSave: () => Promise<void>;
}) {
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim()) void onSave(); }
  return <form className="sheet-details" aria-label="Sheet details" onSubmit={submit}>
    <label className="field">Sheet title<input value={title} required maxLength={200} disabled={busy}
      onChange={event => onChange(event.target.value, tutorial)} /></label>
    <label className="field">YouTube tutorial link<input type="url" placeholder="https://www.youtube.com/watch?v=…"
      value={tutorial} maxLength={500} disabled={busy} onChange={event => onChange(title, event.target.value)} /></label>
    <div className="actions"><button className="primary" type="submit" disabled={busy || conflict || !dirty || !title.trim()}>
      {busy ? "Saving…" : "Save details"}</button>{dirty && <span className="small">Unsaved changes</span>}</div>
  </form>;
}
