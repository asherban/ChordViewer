import { useState, type FormEvent } from "react";
import type { NewSheet } from "./api";
import type { LeadSheet } from "@chordviewer/contracts";
import { ScoreSettingsFields } from "../score/ScoreSettingsFields";

export function NewSheetForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (fields: NewSheet) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<"blank" | "example">("blank");
  const [settings, setSettings] = useState<Pick<LeadSheet, "keySignature" | "timeSignature">>({ keySignature: "C", timeSignature: { numerator: 4, denominator: 4 } });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) await onCreate({ title: title.trim(), template, ...(template === "blank" ? settings : {}) });
  }
  return (
    <form
      className="new-sheet-panel"
      aria-label="New sheet"
      onSubmit={(event) => void submit(event)}
    >
      <div>
        <div className="eyebrow">A NEW IDEA</div>
        <h2>Create a lead sheet</h2>
      </div>
      <label className="field">
        Sheet title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={200}
          disabled={busy}
          placeholder="Give your sheet a name"
        />
      </label>
      <fieldset disabled={busy}>
        <legend>Start with</legend>
        <label className="choice">
          <input
            type="radio"
            name="template"
            checked={template === "blank"}
            onChange={() => setTemplate("blank")}
          />{" "}
          A blank sheet
        </label>
        <label className="choice">
          <input
            type="radio"
            name="template"
            checked={template === "example"}
            onChange={() => setTemplate("example")}
          />{" "}
          A copy of the original example
        </label>
      </fieldset>
      {template === "blank" && <ScoreSettingsFields value={settings} disabled={busy} onChange={setSettings} />}
      <p className="small">Enter chords and melody in separate passes, using MIDI or the editing controls.</p>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={busy || !title.trim()}
        >
          {busy ? "Creating…" : "Create and save sheet"}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
