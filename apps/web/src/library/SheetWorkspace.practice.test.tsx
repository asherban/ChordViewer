// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { parseScore } from "@chordviewer/contracts";
import type { MidiInputEvent, MidiInputModel } from "../midi/useMidiInput";
import { SheetWorkspace } from "./SheetWorkspace";

vi.mock("../score/ScorePreview", () => ({ ScorePreview: () => <div data-testid="score" /> }));

afterEach(cleanup);
it("rearms Practice from current held keys after a blocked dialog without consuming an old release", () => {
  const listeners = new Set<(event: MidiInputEvent) => void>();
  const held = new Set<number>();
  const subscribe = (listener: (event: MidiInputEvent) => void) => {
    listeners.add(listener);
    listener({ type: "reset", held: [...held] });
    return () => { listeners.delete(listener); };
  };
  const midi = { subscribe, snapshot: { held: [], sounding: [], sustainChannels: [], messages: 0 },
    inputs: [], selected: "keyboard", status: "Connected", connect: async () => {}, choose: () => {}, disconnect: () => {} } as unknown as MidiInputModel;
  const score = parseScore(example);
  const saved = { id: score.id, score, tutorialUrl: null, revision: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    favorite: false, draft: false, trashedAt: null, openedAt: null };
  const props = { score, saved, accountId: "test-account", mode: "Practice" as const, active: true, blocked: false, midi,
    busy: false, conflict: false, onDirty: () => {}, onSave: async () => {}, onReload: async () => {}, onEdit: () => {}, canCreate: true };
  const rendered = render(<SheetWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "On match" }));
  const send = (status: number, note: number) => {
    if (status === 0x90) held.add(note); else held.delete(note);
    for (const listener of listeners) listener({ type: "data", data: [status, note, 100] });
  };
  act(() => { send(0x90, 60); rendered.rerender(<SheetWorkspace {...props} blocked />); send(0x80, 60); });
  rendered.rerender(<SheetWorkspace {...props} />);
  act(() => { for (const note of [60, 64, 67]) send(0x90, note); for (const note of [60, 64, 67]) send(0x80, note); });
  expect(screen.getByText("G7", { selector: ".practice-feedback strong" })).toBeTruthy();
  act(() => { send(0x90, 55); rendered.rerender(<SheetWorkspace {...props} blocked />); });
  rendered.rerender(<SheetWorkspace {...props} />); // rearm sees G still physically held
  act(() => { send(0x80, 55); });
  expect(screen.getByText("G7", { selector: ".practice-feedback strong" })).toBeTruthy();
});
