import { useState, type FormEvent } from "react";
import type { NewSheet } from "./api";

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
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) await onCreate({ title: title.trim(), template });
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
      <p className="small">
        Titles and tutorial links can be saved now. Adding notes and chords
        arrives in the next milestones.
      </p>
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
