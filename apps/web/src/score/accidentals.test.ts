import { expect, it } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { melodyAccidentals } from "./accidentals";

it("prints natural cancellation and reapplies accidentals after a tied barline continuation", () => {
  const score = parseScore(structuredClone(example));
  for (const event of [
    score.measures[0].melody[4],
    score.measures[1].melody[0],
    score.measures[1].melody[1],
  ]) {
    if (event.kind === "note") event.pitch = { step: "F", alter: 1, octave: 4 };
  }
  const signs = melodyAccidentals(parseScore(score));
  expect(signs.get("note-b1-f-natural")).toBe("n");
  expect(signs.get("note-b1-g-tie")).toBe("#");
  expect(signs.has("note-b2-g")).toBe(false);
  expect(signs.get("note-b2-a")).toBe("#");
});
