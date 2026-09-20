import { useEffect, useState, type FormEvent } from "react";
import type { SavedSheet } from "./api";

export function SheetDetails({
  saved,
  busy,
  conflict,
  onDirty,
  onSave,
  onReload,
}: {
  saved: SavedSheet;
  busy: boolean;
  conflict: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (title: string, tutorialUrl: string | null) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [title, setTitle] = useState(saved.score.title);
  const [tutorial, setTutorial] = useState(saved.tutorialUrl ?? "");
  function changeTitle(value: string) {
    setTitle(value);
    onDirty(
      value !== saved.score.title || tutorial !== (saved.tutorialUrl ?? ""),
    );
  }
  function changeTutorial(value: string) {
    setTutorial(value);
    onDirty(title !== saved.score.title || value !== (saved.tutorialUrl ?? ""));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) await onSave(title.trim(), tutorial.trim() || null);
  }
  const dirty =
    title !== saved.score.title || tutorial !== (saved.tutorialUrl ?? "");
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);
  return (
    <form
      className="sheet-details"
      aria-label="Sheet details"
      onSubmit={(event) => void submit(event)}
    >
      <label className="field">
        Sheet title
        <input
          value={title}
          onChange={(event) => changeTitle(event.target.value)}
          required
          maxLength={200}
          disabled={busy}
        />
      </label>
      <label className="field">
        YouTube tutorial link
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={tutorial}
          onChange={(event) => changeTutorial(event.target.value)}
          maxLength={500}
          disabled={busy}
        />
      </label>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={busy || conflict || !dirty || !title.trim()}
        >
          {busy ? "Saving…" : "Save details"}
        </button>
        {dirty && <span className="small">Unsaved changes</span>}
      </div>
      {conflict && (
        <div className="conflict-notice">
          <p>
            A newer version is available. Your unsaved details are still here.
            Copy them if needed before reloading.
          </p>
          <button
            className="secondary"
            disabled={busy}
            type="button"
            onClick={() => void onReload()}
          >
            Reload latest version
          </button>
        </div>
      )}
    </form>
  );
}
