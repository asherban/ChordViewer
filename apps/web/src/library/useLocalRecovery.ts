import { useEffect, useRef, useState } from "react";
import type { ScoreDraft } from "../editor/ScoreDraft";
import { recoveryStore, type RecoveryDraft } from "./recovery";

export function useLocalRecovery(model: ScoreDraft, accountId: string | null, restored?: RecoveryDraft | null) {
  const [status, setStatus] = useState("");
  const id = useRef(crypto.randomUUID());
  const source = useRef(restored);
  const previous = useRef("");
  const written = useRef<RecoveryDraft | null>(null);
  const queue = useRef(Promise.resolve());
  const sequence = useRef(0);
  // Queued writes survive development effect replay; a real unmount still suppresses UI updates.
  const alive = useRef(false);
  useEffect(() => { source.current = restored; }, [restored]);
  useEffect(() => {
    if (!accountId) return;
    alive.current = true;
    const persist = () => {
      const view = model.getSnapshot(), base = model.getSavedBase();
      if (!base) return;
      const content = view.dirty ? JSON.stringify([base, view.score, view.title, view.tutorial, view.position]) : "";
      if (previous.current === content) return;
      previous.current = content;
      const request = ++sequence.current;
      const remove = written.current;
      const oldSource = source.current;
      const record: RecoveryDraft | null = view.dirty ? { version: 1, id: id.current, accountId,
        updatedAt: Math.max(Date.now(), (written.current?.updatedAt ?? 0) + 1), base, score: view.score,
        title: view.title, tutorial: view.tutorial, position: view.position } : null;
      written.current = record;
      setStatus(record ? "Writing local recovery copy…" : "");
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (record) await recoveryStore.put(record);
        else { if (remove) await recoveryStore.remove(remove); if (oldSource) await recoveryStore.remove(oldSource); }
        if (alive.current && request === sequence.current) setStatus(record ? "Local recovery copy updated. Save to update your Library." : "");
      }).catch(error => {
        if (alive.current && request === sequence.current) { previous.current = ""; setStatus(error instanceof Error ? error.message : "Local recovery is unavailable. Keep this sheet open or export it."); }
      });
    };
    persist();
    const unsubscribe = model.subscribe(persist);
    return () => { alive.current = false; unsubscribe(); };
  }, [model, accountId]);
  async function clear() {
    const current = written.current, original = source.current;
    try {
      await queue.current;
      if (current) await recoveryStore.remove(current);
      if (original) await recoveryStore.remove(original);
    } catch { /* A failed cleanup leaves an extra recoverable copy, never deletes unconfirmed work. */ }
  }
  return { status, clear };
}
