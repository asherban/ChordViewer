// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MidiMonitor } from "./MidiMonitor";
import { useMidiInput } from "./useMidiInput";

function MonitorHarness() {
  return <MidiMonitor midi={useMidiInput()} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps the existing listener when the selected input is selected again", async () => {
  const device = {
    id: "loopback",
    name: "Loopback",
    state: "connected",
    onmidimessage: null as ((event: MIDIMessageEvent) => void) | null,
    close: vi.fn(async () => {}),
  };
  const midi = {
    inputs: new Map([["loopback", device]]),
    onstatechange: null,
  } as unknown as MIDIAccess;
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: vi.fn().mockResolvedValue(midi),
  });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  render(<MonitorHarness />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enable MIDI" }));
  });
  const handler = device.onmidimessage;
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "loopback" },
  });
  expect(device.close).not.toHaveBeenCalled();
  expect(device.onmidimessage).toBe(handler);
  act(() => {
    handler?.({ data: new Uint8Array([0x90, 60, 96]) } as MIDIMessageEvent);
  });
  expect(screen.getByTestId("held-notes").textContent).toContain("C4 · ch 1");
});

it("does not resume input when a permission response arrives after the page was hidden", async () => {
  let resolvePermission!: (value: MIDIAccess) => void;
  const permission = new Promise<MIDIAccess>((resolve) => {
    resolvePermission = resolve;
  });
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: vi.fn(() => permission),
  });
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const device = {
    id: "loopback",
    name: "Loopback",
    state: "connected",
    onmidimessage: null,
    close: vi.fn(async () => {}),
  };
  const midi = {
    inputs: new Map([["loopback", device]]),
    onstatechange: null,
  } as unknown as MIDIAccess;
  render(<MonitorHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Enable MIDI" }));
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => {
    resolvePermission(midi);
    await permission;
  });
  expect(device.onmidimessage).toBeNull();
  expect(midi.onstatechange).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("MIDI paused");
});

it("detaches a previous access handler when reconnecting and clears the active handler on unmount", async () => {
  const first = {
    inputs: new Map(),
    onstatechange: null,
  } as unknown as MIDIAccess;
  const second = {
    inputs: new Map(),
    onstatechange: null,
  } as unknown as MIDIAccess;
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
  });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = render(<MonitorHarness />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enable MIDI" }));
  });
  expect(first.onstatechange).not.toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enable MIDI" }));
  });
  expect(first.onstatechange).toBeNull();
  expect(second.onstatechange).not.toBeNull();
  view.unmount();
  expect(second.onstatechange).toBeNull();
});
