import { describe, expect, it } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ScoreDraft } from "./ScoreDraft";

const base = parseScore({ ...example, measures: [{ ...example.measures[0], chords: [],
  melody: example.measures[0].melody.map(event => "tieToNext" in event ? { ...event, tieToNext: false } : event) }] });
const saved = { id: base.id, score: base, tutorialUrl: null, revision: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  favorite: false, draft: false, trashedAt: null, openedAt: null };
function editor() { let id = 0; const model = new ScoreDraft(base, saved, () => `test-${++id}`); model.configure(true, true, false); return model; }
function bytes(model: ScoreDraft, ...data: number[]) { model.receive({ type: "data", data }); }
function chord(model: ScoreDraft, notes = [60, 64, 67]) {
  notes.forEach(note => bytes(model, 0x90, note, 96));
  notes.forEach(note => bytes(model, 0x80, note, 0));
}
it("preserves a dirty score, details and undo across Library metadata, but applies explicit reload", () => {
  const model = editor();
  model.addChord("C");
  model.details("Changed locally", "https://www.youtube.com/watch?v=abcdefghijk");
  const before = model.getSnapshot();
  expect(before.dirty).toBe(true);
  expect(before.undoCount).toBeGreaterThan(0);
  const metadata = { ...saved, revision: 2, favorite: true };
  model.acceptSaved(metadata, true);
  expect(model.getSnapshot().score).toEqual(before.score);
  expect(model.getSnapshot().title).toBe("Changed locally");
  expect(model.getSnapshot().undoCount).toBe(before.undoCount);
  expect(model.getSnapshot().dirty).toBe(true);
  model.acceptSaved({ ...saved, revision: 2 }); // user confirmed Reload latest, even if backend content is unchanged
  expect(model.getSnapshot().score).toEqual(base);
  expect(model.getSnapshot().dirty).toBe(false);
});
describe("synchronous chord draft", () => {
  it("restores the next-bar insertion position without moving into the completed bar", () => {
    const original = editor();
    original.addChord("C");
    const draft = original.getSnapshot();
    expect(draft.position).toEqual({ measureIndex: 1, offsetTicks: 0 });

    const restored = new ScoreDraft(base, saved);
    restored.configure(true, true, false);
    restored.restoreDraft(draft.score, draft.title, draft.tutorial, draft.position);
    expect(restored.getSnapshot().position).toEqual(draft.position);
    expect(restored.addChord("F")).toBe(true);
    expect(restored.getSnapshot().score.measures.map(measure => measure.chords.map(chord => chord.symbol)))
      .toEqual([["C"], ["F"]]);
  });
  it("keeps every fast gesture without a render between them, selected durations and the melody", () => {
    const model = editor(); model.setDuration(480); model.arm();
    chord(model); chord(model, [65, 69, 72]); chord(model, [67, 71, 74]);
    const view = model.getSnapshot();
    expect(view.score.measures[0].chords.map(event => [event.symbol, event.offsetTicks, event.durationTicks]))
      .toEqual([["C", 0, 480], ["F", 480, 480], ["G", 960, 480]]);
    expect(view.position).toEqual({ measureIndex: 0, offsetTicks: 1440 });
    expect(view.score.measures[0].melody).toEqual(base.measures[0].melody);
    expect(view.dirty).toBe(true);
  });
  it("inserts once per physical release with sustain held and ignores its eventual release", () => {
    const model = editor(); model.arm(); bytes(model, 0xb0, 64, 127);
    chord(model); chord(model); bytes(model, 0xb0, 64, 0);
    expect(model.getSnapshot().score.measures.map(bar => bar.chords.length)).toEqual([1, 1]);
  });
  it("arms only for fresh gestures after attaching while keys were held", () => {
    const model = editor(); model.receive({ type: "reset", held: [60, 64] }); model.arm();
    bytes(model, 0x90, 67, 96); [60, 64, 67].forEach(note => bytes(model, 0x80, note, 0));
    expect(model.getSnapshot().dirty).toBe(false);
    chord(model); expect(model.getSnapshot().score.measures[0].chords).toHaveLength(1);
  });
  it.each(["paused", "practice", "dialog", "disconnect", "saving"])("does not write after %s interrupts a partial gesture", reason => {
    const model = editor(); model.arm(); bytes(model, 0x90, 60, 96);
    if (reason === "paused") model.pause();
    else if (reason === "disconnect") model.receive({ type: "reset", held: [] });
    else model.configure(reason === "dialog", true, reason === "dialog");
    bytes(model, 0x90, 64, 96); bytes(model, 0x90, 67, 96);
    [60, 64, 67].forEach(note => bytes(model, 0x80, note, 0));
    expect(model.getSnapshot().dirty).toBe(false);
    model.configure(true, true, false); model.arm(); chord(model);
    expect(model.getSnapshot().score.measures[0].chords).toHaveLength(1);
  });
  it("preserves music and insertion position through undo/redo and save", () => {
    const model = editor(); model.arm(); chord(model); chord(model, [65, 69, 72]);
    const completed = model.getSnapshot().score;
    model.acceptSaved({ ...saved, score: completed, revision: 2 });
    expect(model.getSnapshot().dirty).toBe(false);
    model.undo(); expect(model.getSnapshot().score.measures).toHaveLength(1);
    expect(model.getSnapshot().position).toEqual({ measureIndex: 1, offsetTicks: 0 });
    expect(model.getSnapshot().dirty).toBe(true);
    model.redo(); expect(model.getSnapshot().score).toEqual(completed);
    expect(model.getSnapshot().dirty).toBe(false);
  });
  it("changes symbols and durations, deletes without shifting time, and keeps metadata across undo", () => {
    const model = editor(); model.setDuration(480); model.arm(); chord(model); chord(model, [65, 69, 72]);
    const first = model.getSnapshot().score.measures[0].chords[0];
    model.selectChord(first.id); model.changeSelected(" Dm7 ", 240);
    expect(model.getSnapshot().score.measures[0].chords[0]).toMatchObject({ symbol: "Dm7", durationTicks: 240 });
    model.details("A new title", "https://youtu.be/dQw4w9WgXcQ"); model.deleteSelected();
    expect(model.getSnapshot().score.measures[0].chords[0]).toMatchObject({ symbol: "F", offsetTicks: 480 });
    model.undo(); expect(model.getSnapshot().title).toBe("A new title");
    expect(model.getSnapshot().score.measures[0].melody).toEqual(base.measures[0].melody);
  });
  it("one-shot replacement retains identity, advances once, then pauses", () => {
    const model = editor(); model.setDuration(480); model.arm(); chord(model);
    const first = model.getSnapshot().score.measures[0].chords[0];
    model.selectChord(first.id); model.arm(true); chord(model, [65, 69, 72]); chord(model);
    expect(model.getSnapshot().score.measures[0].chords).toEqual([{ ...first, symbol: "F" }]);
    expect(model.getSnapshot().entry).toBe("paused");
  });
  it("retains an unrecognized capture for naming instead of inventing a symbol", () => {
    const model = editor(); model.arm(); chord(model, [60, 61, 62]);
    expect(model.getSnapshot().pending?.notes).toEqual([60, 61, 62]);
    expect(model.getSnapshot().dirty).toBe(false);
    model.applyPending("  C cluster  ");
    expect(model.getSnapshot().score.measures[0].chords[0].symbol).toBe("C cluster");
    expect(model.getSnapshot().entry).toBe("paused");
  });
  it("does not shorten a chord at a barline; captured duration can be corrected", () => {
    const model = editor(); model.selectPosition({ measureIndex: 0, offsetTicks: 1440 }); model.arm(); chord(model);
    expect(model.getSnapshot().dirty).toBe(false);
    expect(model.getSnapshot().notice).toContain("barline");
    model.setDuration(480); model.applyPending("C");
    expect(model.getSnapshot().score.measures[0].chords[0]).toMatchObject({ offsetTicks: 1440, durationTicks: 480 });
  });
  it("does not overwrite a neighbouring chord when a correction is too long", () => {
    const model = editor(); model.setDuration(480); model.arm(); chord(model); chord(model);
    const original = model.getSnapshot().score;
    model.selectChord(original.measures[0].chords[0].id); model.changeSelected("G", 1920);
    expect(model.getSnapshot().score).toBe(original);
    expect(model.getSnapshot().notice).toContain("already a chord");
  });
});
