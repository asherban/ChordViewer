// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { appendChord, parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ScorePreview } from "./ScorePreview";

const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

for (const melody of [false, true]) it(`highlights every logical chord fragment and no unselected legacy chord (${melody ? "stave" : "chord grid"})`, async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (text: string) => ({ width: text.length * 20 }) } as CanvasRenderingContext2D);
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
  const legacy = parseScore(example);
  const selectChord = vi.fn();
  const editing = { position: { measureIndex: 0, offsetTicks: 0 }, selectedId: null as string | null, writable: true,
    lane: "chords" as const, selectChord, selectMelody: vi.fn(), selectPosition: vi.fn() };
  const view = render(<ScorePreview score={legacy} melody={melody} editing={editing} />);
  await waitFor(() => expect(view.container.querySelectorAll('.editable-chord').length).toBeGreaterThan(0));
  expect(view.container.querySelectorAll('.editable-chord[aria-pressed="true"]')).toHaveLength(0);
  const blank = { ...legacy, measures: [{ ...legacy.measures[0]!, chords: [], melody: [] }] };
  let next = 0;
  const score = appendChord(blank, "C", 2400, () => `logical-${++next}`).score;
  const continuation = score.measures[1]!.chords[0]!.id;
  view.rerender(<ScorePreview score={score} melody={melody} editing={{ ...editing, selectedId: continuation }} />);
  await waitFor(() => expect(view.container.querySelectorAll('.editable-chord[aria-pressed="true"]')).toHaveLength(2));
  fireEvent.click(view.container.querySelectorAll('.editable-chord')[1]!);
  expect(selectChord).toHaveBeenLastCalledWith(continuation);
  const practice = { bar: 1, chordId: continuation, selectBar: vi.fn(), selectChord };
  view.rerender(<ScorePreview score={score} melody={melody} practice={practice} />);
  await waitFor(() => expect(view.container.querySelectorAll('.practice-chord-target[aria-pressed="true"], .practice-chord[aria-pressed="true"]')).toHaveLength(2));
  view.rerender(<ScorePreview score={legacy} melody={melody} practice={{ ...practice, chordId: null }} />);
  expect(view.container.querySelectorAll('[data-practice-chord-current="true"]')).toHaveLength(0);
});

it("follows a changed practice target without scrolling for unrelated MIDI renders", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 20 }),
  } as CanvasRenderingContext2D);
  const scroll = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: scroll, configurable: true });
  const score = parseScore(example);
  const practice = { bar: 0, chordId: score.measures[0].chords[0].id, selectBar: () => {}, selectChord: () => {} };
  const view = render(<ScorePreview score={score} melody={false} practice={practice} />);
  expect(scroll).toHaveBeenCalledTimes(1);

  // SheetWorkspace builds fresh callbacks when live MIDI feedback renders.
  view.rerender(<ScorePreview score={score} melody={false} practice={{ ...practice, selectBar: () => {} }} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<ScorePreview score={score} melody={false} practice={{ ...practice, bar: 1, chordId: score.measures[1].chords[0].id }} />);
  expect(scroll).toHaveBeenCalledTimes(2);
});
