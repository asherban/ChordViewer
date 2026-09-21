import { describe, expect, it } from "vitest";
import { parseScore, type MelodySpec } from "@chordviewer/contracts";
import { ScoreDraft } from "./ScoreDraft";

const quarter: MelodySpec = { kind: "note", pitch: { step: "C", alter: 0, octave: 4 }, duration: { denominator: 4, dots: 0 } };
function draft() {
  let id = 0;
  const score = parseScore({ schemaVersion: 2, id: "melody-study", title: "Melody study", keySignature: "G", timeSignature: { numerator: 3, denominator: 4 }, ticksPerQuarter: 480,
    measures: [{ id: "bar", chords: [], melody: [] }] });
  const model = new ScoreDraft(score, null, () => `event-${++id}`);
  model.configure(true, true, false);
  return model;
}
function play(model: ScoreDraft, notes: number[]) {
  notes.forEach(note => model.receive({ type: "data", data: [144, note, 96] }));
  notes.forEach(note => model.receive({ type: "data", data: [128, note, 0] }));
}

describe("two-pass score authoring", () => {
  it("remembers each lane cursor and inserts one note on physical release with key-aware spelling", () => {
    const model = draft(); model.arm(); play(model, [60, 64, 67]);
    const chords = model.getSnapshot().score.measures[0].chords;
    expect(model.getSnapshot().position).toEqual({ measureIndex: 1, offsetTicks: 0 });
    model.setLane("melody");
    expect(model.getSnapshot().position).toEqual({ measureIndex: 0, offsetTicks: 0 });
    expect(model.getSnapshot().entry).toBe("paused");
    model.arm(); model.receive({ type: "data", data: [176, 64, 127] });
    play(model, [66]); play(model, [66]);
    model.receive({ type: "data", data: [176, 64, 0] });
    expect(model.getSnapshot().score.measures[0].melody).toMatchObject([
      { offsetTicks: 0, pitch: { step: "F", alter: 1, octave: 4 } }, { offsetTicks: 480, pitch: { step: "F", alter: 1, octave: 4 } },
    ]);
    expect(model.getSnapshot().score.measures[0].chords).toEqual(chords);
    model.setLane("chords"); expect(model.getSnapshot().position).toEqual({ measureIndex: 1, offsetTicks: 0 });
    model.setLane("melody"); expect(model.getSnapshot().position).toEqual({ measureIndex: 0, offsetTicks: 960 });
  });
  it("rejects overlapping pitches and cancels a partial gesture when the pass changes", () => {
    const model = draft(); model.setLane("melody"); model.arm(); play(model, [60, 64]);
    expect(model.getSnapshot().score.measures[0].melody).toHaveLength(0);
    expect(model.getSnapshot().notice).toContain("one note");
    expect(model.getSnapshot().entry).toBe("paused");
    play(model, [62]);
    expect(model.getSnapshot().score.measures[0].melody).toHaveLength(0);
    model.arm();
    model.receive({ type: "data", data: [144, 60, 96] }); model.setLane("chords");
    model.receive({ type: "data", data: [128, 60, 0] });
    expect(model.getSnapshot().dirty).toBe(false);
  });
  it("retains a melody gesture when it cannot fit, then retries with a shorter dotted value", () => {
    const model = draft(); model.setLane("melody"); model.selectPosition({ measureIndex: 0, offsetTicks: 1260 });
    model.arm(); play(model, [62]);
    expect(model.getSnapshot().pending?.lane).toBe("melody");
    expect(model.getSnapshot().dirty).toBe(false);
    model.setLane("chords");
    expect(model.getSnapshot().lane).toBe("melody");
    expect(model.settings("F", { numerator: 4, denominator: 4 })).toBe(false);
    expect(model.getSnapshot().pending?.lane).toBe("melody");
    model.setMelodyDuration({ denominator: 16, dots: 1 });
    const pending = model.getSnapshot().pending;
    if (pending?.lane !== "melody") throw new Error("Missing retained note");
    model.applyPendingMelody(pending.spec);
    expect(model.getSnapshot().pending).toBeNull();
    expect(model.getSnapshot().score.measures[0].melody[0]).toMatchObject({ offsetTicks: 1260, duration: { denominator: 16, dots: 1 } });
    expect(model.getSnapshot().position).toEqual({ measureIndex: 1, offsetTicks: 0 });
  });
  it("deletes a note as an equal rest, replaces that rest from MIDI, and undoes across lanes", () => {
    const model = draft(); model.addChord("G"); model.setLane("melody"); model.addMelody(quarter);
    const note = model.getSnapshot().score.measures[0].melody[0];
    model.selectMelody(note.id); model.deleteSelected();
    expect(model.getSnapshot().score.measures[0].melody[0]).toEqual({ id: note.id, kind: "rest", offsetTicks: 0, duration: quarter.duration });
    model.selectMelody(note.id); model.arm(true); play(model, [65]); play(model, [67]);
    expect(model.getSnapshot().score.measures[0].melody).toMatchObject([{ id: note.id, pitch: { step: "F", alter: 0, octave: 4 } }]);
    expect(model.getSnapshot().entry).toBe("paused");
    model.undo(); model.undo(); model.undo();
    expect(model.getSnapshot().score.measures[0].melody).toHaveLength(0);
    model.undo(); expect(model.getSnapshot().lane).toBe("chords");
    expect(model.getSnapshot().score.measures[0].chords).toHaveLength(0);
    model.redo(); expect(model.getSnapshot().score.measures[0].chords).toHaveLength(1);
  });
  it("clears invalid old ties on a pitch change and leaves explicit invalid tie requests atomic", () => {
    const model = draft(); model.setLane("melody"); model.addMelody(quarter); model.addMelody(quarter);
    const first = model.getSnapshot().score.measures[0].melody[0];
    model.selectMelody(first.id); model.changeMelody(quarter, true);
    expect(model.getSnapshot().score.measures[0].melody[0]).toHaveProperty("tieToNext", true);
    const changed: MelodySpec = { ...quarter, pitch: { step: "D", alter: 0, octave: 4 } };
    model.changeMelody(changed);
    expect(model.getSnapshot().score.measures[0].melody[0]).not.toHaveProperty("tieToNext");
    const before = model.getSnapshot().score;
    model.changeMelody(changed, true);
    expect(model.getSnapshot().score).toBe(before);
    expect(model.getSnapshot().notice).toContain("tie");
  });
  it("keeps key and meter in dirty/history state and rejects shortening occupied bars", () => {
    const model = draft(); model.addChord("G");
    const before = model.getSnapshot().score;
    expect(model.settings("Bb", { numerator: 2, denominator: 4 })).toBe(false);
    expect(model.getSnapshot().score).toBe(before);
    expect(model.settings("Bb", { numerator: 6, denominator: 8 })).toBe(true);
    expect(model.getSnapshot().score.keySignature).toBe("Bb");
    model.undo(); expect(model.getSnapshot().score).toEqual(before);
    model.redo(); expect(model.getSnapshot().score.timeSignature).toEqual({ numerator: 6, denominator: 8 });
  });
  it.each(["practice", "disconnect", "blocked"])("cannot write melody after %s interrupts capture", reason => {
    const model = draft(); model.setLane("melody"); model.arm();
    model.receive({ type: "data", data: [144, 60, 96] });
    if (reason === "disconnect") model.receive({ type: "reset", held: [] });
    else model.configure(reason === "blocked", true, reason === "blocked");
    model.receive({ type: "data", data: [128, 60, 0] });
    expect(model.getSnapshot().dirty).toBe(false);
  });
});
