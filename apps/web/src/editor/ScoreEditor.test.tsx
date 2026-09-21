// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ScoreDraft } from "./ScoreDraft";
import { ScoreEntryControls } from "./ScoreEditor";

afterEach(cleanup);

function Controls({ model }: { model: ScoreDraft }) {
  const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return <ScoreEntryControls model={model} view={view} />;
}

it("corrects a rejected MIDI replacement using the captured chord, preserving its typed name when shortened", () => {
  const score = parseScore(structuredClone(example));
  score.measures.forEach(bar => { bar.chords = []; });
  const model = new ScoreDraft(score, null, () => "new-chord");
  model.configure(true, true, false);
  model.selectPosition({ measureIndex: 0, offsetTicks: 1440 });
  model.setDuration(480); model.arm();
  const play = (notes: number[]) => {
    notes.forEach(note => model.receive({ type: "data", data: [144, note, 96] }));
    notes.forEach(note => model.receive({ type: "data", data: [128, note, 0] }));
  };
  play([60, 64, 67]);
  model.selectChord("new-chord"); model.setDuration(960); model.arm(true);
  play([67, 71, 74]);
  render(<Controls model={model} />);
  expect(screen.getByRole("form", { name: "Captured chord" })).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "Chord symbol" }) as HTMLInputElement).value).toBe("G");
  fireEvent.change(screen.getByRole("textbox", { name: "Chord symbol" }), { target: { value: "G7" } });
  fireEvent.change(screen.getByRole("combobox", { name: "New chord duration" }), { target: { value: "480" } });
  expect((screen.getByRole("textbox", { name: "Chord symbol" }) as HTMLInputElement).value).toBe("G7");
  fireEvent.click(screen.getByRole("button", { name: "Insert captured chord" }));
  expect(model.getSnapshot().score.measures[0].chords).toEqual([
    { id: "new-chord", symbol: "G7", offsetTicks: 1440, durationTicks: 480 },
  ]);
  expect(model.getSnapshot().pending).toBeNull();
});
