import { describe, expect, it } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { parseRecovery, parseRecoveryList, RECOVERY_LIMIT, type RecoveryDraft } from "./recovery";
import { ScoreDraft } from "../editor/ScoreDraft";

const score = parseScore(example);
const base = { id: score.id, score, tutorialUrl: null, revision: 1, createdAt: "2026-09-20T12:00:00Z",
  updatedAt: "2026-09-20T12:00:00Z", favorite: false, draft: false, trashedAt: null, openedAt: null };
const copy: RecoveryDraft = { version: 1, id: "d426dbf3-baf2-47df-9953-693eea428acc", accountId: "account-a",
  updatedAt: 42, base, score, title: "Recovered title", tutorial: "", position: { measureIndex: 1, offsetTicks: 480 } };

describe("local recovery boundary", () => {
  it("lists valid copies despite damaged rows and never exposes another account's draft", () => {
    const newer = { ...copy, id: "857737d6-e035-438c-b8d6-6c1fa790d3b0", updatedAt: 43 };
    const damaged = { ...copy, score: null };
    const foreign = { ...copy, accountId: "account-b" };
    const rows = [copy, damaged, foreign, newer];
    expect(parseRecoveryList(rows, "account-a")).toEqual({ drafts: [newer, copy], unreadableCount: 2 });
    expect(rows).toEqual([copy, damaged, foreign, newer]);
    expect(parseRecoveryList([damaged], "account-a")).toEqual({ drafts: [], unreadableCount: 1 });
    expect(() => parseRecoveryList(Array.from({ length: RECOVERY_LIMIT + 1 }, () => copy), "account-a")).toThrow("Too many");
  });
  it("restores authored content with the original revision, paused MIDI and a fresh history", () => {
    const model = new ScoreDraft(score, base);
    model.configure(true, true, false); model.arm();
    const restored = parseRecovery(JSON.parse(JSON.stringify(copy)), "account-a");
    model.restoreDraft(restored.score, restored.title, restored.tutorial, restored.position);
    expect(model.getSavedBase()?.revision).toBe(1);
    expect(model.getSnapshot()).toMatchObject({ dirty: true, title: "Recovered title", entry: "paused", undoCount: 0, redoCount: 0, position: copy.position });
    model.receive({ type: "data", data: [144, 60, 90, 144, 64, 90, 144, 67, 90, 128, 60, 0, 128, 64, 0, 128, 67, 0] });
    expect(model.getSnapshot().score).toEqual(score);
  });
  it("allows temporarily blank details without losing valid music", () => {
    expect(parseRecovery({ ...copy, title: "", tutorial: "unfinished link" }, "account-a").score).toEqual(score);
  });
  it("resets entry duration to the recovered meter", () => {
    const restoredScore = parseScore({ ...score, schemaVersion: 2, timeSignature: { numerator: 3, denominator: 4 },
      measures: score.measures.map(bar => ({ ...bar, chords: [], melody: [] })) });
    const model = new ScoreDraft(score, base);
    model.restoreDraft(restoredScore, "New meter", "", { measureIndex: 0, offsetTicks: 0 });
    expect(model.getSnapshot()).toMatchObject({ lane: "chords", duration: 1440, entry: "paused" });
  });
  it.each([
    { accountId: "account-b" }, { version: 2 }, { updatedAt: -1 }, { id: "../../file" },
    { score: { ...score, id: "another-sheet" } }, { base: { ...base, revision: 0 } },
    { position: { measureIndex: 999, offsetTicks: 0 } }, { title: "x".repeat(401) },
  ])("rejects invalid or foreign recovery input %#", patch => {
    expect(() => parseRecovery({ ...copy, ...patch }, "account-a")).toThrow();
  });
});
