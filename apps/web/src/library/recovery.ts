import { parseScore, type ChordPosition, type LeadSheet } from "@chordviewer/contracts";
import { parseSavedSheet, type SavedSheet } from "./api";

export const RECOVERY_LIMIT = 20;
export const RECOVERY_BYTES = 2_200_000;
export const RECOVERY_CHANGED = "chordviewer-recovery-changed";
export type RecoveryDraft = {
  version: 1; id: string; accountId: string; updatedAt: number;
  base: SavedSheet; score: LeadSheet; title: string; tutorial: string; position: ChordPosition;
};

/** Local storage is untrusted input, and must never supply credentials or a newer revision. */
export function parseRecovery(value: unknown, accountId: string): RecoveryDraft {
  if (!value || typeof value !== "object" || new TextEncoder().encode(JSON.stringify(value)).length > RECOVERY_BYTES)
    throw new Error("Recovery copy is invalid or too large.");
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || typeof r.id !== "string" || !/^[a-f0-9-]{36}$/.test(r.id) ||
      r.accountId !== accountId || !Number.isSafeInteger(r.updatedAt) || (r.updatedAt as number) < 0 ||
      typeof r.title !== "string" || r.title.length > 400 || typeof r.tutorial !== "string" || r.tutorial.length > 500)
    throw new Error("Recovery copy is invalid or belongs to another account.");
  const base = parseSavedSheet(r.base);
  const score = parseScore(r.score);
  const position = r.position as ChordPosition | undefined;
  if (score.id !== base.id || !position || !Number.isSafeInteger(position.measureIndex) ||
      !Number.isSafeInteger(position.offsetTicks) || position.measureIndex < 0 || position.measureIndex > 256 ||
      position.offsetTicks < 0 || position.offsetTicks > 11520) throw new Error("Invalid recovery score or position.");
  return { version: 1, id: r.id, accountId, updatedAt: r.updatedAt as number, base, score,
    title: r.title, tutorial: r.tutorial, position };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const opening = indexedDB.open("chordviewer-recovery", 1);
    opening.onupgradeneeded = () => {
      const records = opening.result.createObjectStore("drafts", { keyPath: "id" });
      records.createIndex("account", "accountId");
    };
    opening.onerror = () => reject(new Error("Local recovery storage is unavailable."));
    opening.onblocked = () => { blocked = true; reject(new Error("Close older ChordViewer tabs to enable local recovery.")); };
    opening.onsuccess = () => {
      if (blocked) opening.result.close();
      else { opening.result.onversionchange = () => opening.result.close(); resolve(opening.result); }
    };
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      let value: T;
      tx.oncomplete = () => { if (mode === "readwrite") window.dispatchEvent(new Event(RECOVERY_CHANGED)); resolve(value); };
      tx.onabort = tx.onerror = () => reject(new Error("Local recovery write failed. Free storage or remove an older recovery copy; keep this sheet open or export it."));
      try { action(tx.objectStore("drafts"), next => { value = next; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}

export const recoveryStore = {
  async list(accountId: string): Promise<RecoveryDraft[]> {
    const rows = await transaction<unknown[]>("readonly", (store, result) => {
      const read = store.index("account").getAll(accountId, RECOVERY_LIMIT + 1);
      read.onsuccess = () => result(read.result);
    });
    if (rows.length > RECOVERY_LIMIT) throw new Error("Too many local recovery copies.");
    return rows.map(row => parseRecovery(row, accountId)).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async put(record: RecoveryDraft): Promise<void> {
    const clean = parseRecovery(record, record.accountId);
    return transaction<void>("readwrite", (store, result) => {
      const existing = store.get(clean.id);
      existing.onsuccess = () => {
        const count = store.count();
        count.onsuccess = () => {
          if ((!existing.result && count.result >= RECOVERY_LIMIT) ||
              (existing.result && existing.result.accountId !== clean.accountId)) { store.transaction.abort(); return; }
          store.put(clean); result(undefined);
        };
      };
    });
  },
  /** Compare-and-delete prevents an old recovery choice from deleting a newer write in another tab. */
  async remove(record: RecoveryDraft): Promise<void> {
    return transaction<void>("readwrite", (store, result) => {
      const read = store.get(record.id);
      read.onsuccess = () => {
        if (read.result?.accountId === record.accountId && read.result?.updatedAt === record.updatedAt) store.delete(record.id);
        result(undefined);
      };
    });
  },
};
