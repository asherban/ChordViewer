import { describe, expect, it } from "vitest";
import { MidiState } from "./state";

describe("browser MIDI state", () => {
  it("keeps channel-specific sustain separate and honors zero velocity note-off", () => {
    const state = new MidiState();
    state.receive([0x90, 60, 90]);
    state.receive([0x91, 60, 90]);
    state.receive([0xb0, 64, 127]);
    state.receive([0x90, 60, 0]);
    state.receive([0x81, 60, 0]);
    expect(state.snapshot().held).toEqual([]);
    expect(state.snapshot().sounding).toEqual([60]);
    expect(state.receive([0xb0, 64, 0]).sounding).toEqual([]);
  });
  it("does not accumulate repeated note-on and clears state on disconnect", () => {
    const state = new MidiState();
    state.receive([0x90, 64, 70]);
    state.receive([0x90, 64, 80]);
    expect(state.snapshot().held).toEqual([64]);
    expect(state.reset()).toEqual({
      held: [],
      sounding: [],
      sustainChannels: [],
      messages: 0,
    });
  });
  it("clears only the addressed channel for panic controls", () => {
    const state = new MidiState();
    state.receive([0x90, 60, 90]);
    state.receive([0x91, 60, 90]);
    expect(state.receive([0xb0, 120, 0]).sounding).toEqual([188]);
  });
});
