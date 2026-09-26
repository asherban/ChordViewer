// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ScorePreview } from "./ScorePreview";

const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
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
