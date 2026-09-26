import { useEffect, useState } from "react";
import { RECOVERY_CHANGED, recoveryStore, type RecoveryDraft } from "./recovery";

export function RecoveryLibrary({ accountId, busy, onRestore }: {
  accountId: string; busy: boolean; onRestore: (draft: RecoveryDraft) => void;
}) {
  const [drafts, setDrafts] = useState<RecoveryDraft[]>([]);
  const [unreadableCount, setUnreadableCount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true, sequence = 0;
    const refresh = () => { const request = ++sequence; void recoveryStore.list(accountId).then(rows => {
      if (alive && request === sequence) { setDrafts(rows.drafts); setUnreadableCount(rows.unreadableCount); setError(""); }
    }).catch(() => { if (alive && request === sequence) setError("Local recovery copies could not be read. Keep the original tab open if it contains unsaved work."); }); };
    refresh(); window.addEventListener(RECOVERY_CHANGED, refresh); window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener(RECOVERY_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, [accountId]);
  if (!drafts.length && !unreadableCount && !error) return null;
  return <section className="recovery-library" aria-label="Local recovery copies">
    <h2>Recover unsaved work</h2><p className="small">These copies stay on this device, separately from your saved Library. Restore keeps the original revision; Save is always explicit.</p>
    {error && <p role="alert">{error}</p>}
    {unreadableCount > 0 && <p role="alert">{unreadableCount === 1
      ? "One local recovery copy could not be read. It remains stored on this device."
      : `${unreadableCount} local recovery copies could not be read. They remain stored on this device.`}</p>}
    {drafts.map(draft => <article key={draft.id} className="recovery-row">
      <div><strong>{draft.title || "Untitled draft"}</strong><p className="small">{new Date(draft.updatedAt).toLocaleString()} · based on revision {draft.base.revision}</p></div>
      <button className="secondary" disabled={busy} onClick={() => onRestore(draft)}>Restore draft</button>
      <button className="text-button" disabled={busy} onClick={() => {
        if (window.confirm("Delete this local recovery copy? This does not delete the server-saved sheet."))
          void recoveryStore.remove(draft).catch(() => setError("The recovery copy could not be removed."));
      }}>Delete recovery copy</button>
    </article>)}
  </section>;
}
