// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMidiInput } from "./useMidiInput";

const originalRequest = Object.getOwnPropertyDescriptor(
  navigator,
  "requestMIDIAccess",
);
function device(id: string) {
  return {
    id,
    name: id,
    state: "connected",
    onmidimessage: null as ((event: MIDIMessageEvent) => void) | null,
    close: vi.fn(async () => {}),
  };
}
function access(...devices: ReturnType<typeof device>[]) {
  return {
    inputs: new Map(devices.map((input) => [input.id, input])),
    onstatechange: null,
  } as unknown as MIDIAccess;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((success, fail) => {
    resolve = success;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function installRequest(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: request,
  });
}
function note(number: number) {
  return { data: new Uint8Array([0x90, number, 96]) } as MIDIMessageEvent;
}

beforeEach(() => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalRequest)
    Object.defineProperty(navigator, "requestMIDIAccess", originalRequest);
  else Reflect.deleteProperty(navigator, "requestMIDIAccess");
});

it("ignores permission granted after disconnect while allowing a fresh connection", async () => {
  const oldPermission = deferred<MIDIAccess>();
  const oldDevice = device("old");
  const newDevice = device("new");
  const oldAccess = access(oldDevice);
  const newAccess = access(newDevice);
  const request = vi
    .fn()
    .mockReturnValueOnce(oldPermission.promise)
    .mockResolvedValueOnce(newAccess);
  installRequest(request);
  const { result } = renderHook(useMidiInput);
  let oldConnect!: Promise<void>;
  act(() => {
    oldConnect = result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    await result.current.connect();
  });
  await act(async () => {
    oldPermission.resolve(oldAccess);
    await oldConnect;
  });
  expect(result.current.selected).toBe("new");
  expect(oldDevice.onmidimessage).toBeNull();
  expect(oldAccess.onstatechange).toBeNull();
  expect(newDevice.onmidimessage).not.toBeNull();
  expect(result.current.status).toContain("Listening locally");
});

it("does not let an old rejected permission overwrite or unlock a newer request", async () => {
  const first = deferred<MIDIAccess>();
  const second = deferred<MIDIAccess>();
  const input = device("fresh");
  const request = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  installRequest(request);
  const { result } = renderHook(useMidiInput);
  let oldConnect!: Promise<void>;
  let freshConnect!: Promise<void>;
  act(() => {
    oldConnect = result.current.connect();
  });
  act(() => result.current.disconnect());
  act(() => {
    freshConnect = result.current.connect();
  });
  const status = result.current.status;
  await act(async () => {
    first.reject(new Error("Earlier request denied"));
    await oldConnect;
  });
  expect(result.current.status).toBe(status);
  await act(async () => {
    await result.current.connect();
  });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => {
    second.resolve(access(input));
    await freshConnect;
  });
  expect(result.current.selected).toBe("fresh");
  expect(result.current.status).toContain("Listening locally");
});

it("detaches callbacks and prevents queued frames or device events after disconnect", async () => {
  const input = device("piano");
  const midi = access(input);
  installRequest(vi.fn().mockResolvedValue(midi));
  const { result } = renderHook(useMidiInput);
  await act(async () => {
    await result.current.connect();
  });
  const oldFrame = input.onmidimessage!;
  const oldStateChange = midi.onstatechange!;
  act(() => oldFrame(note(60)));
  expect(result.current.snapshot.held).toEqual([60]);
  act(() => result.current.disconnect());
  act(() => {
    oldFrame(note(62));
    oldStateChange.call(midi, new Event("statechange") as MIDIConnectionEvent);
  });
  expect(result.current.snapshot.held).toEqual([]);
  expect(result.current.inputs).toEqual([]);
  expect(result.current.selected).toBe("");
  expect(input.onmidimessage).toBeNull();
  expect(midi.onstatechange).toBeNull();
  expect(result.current.status).toContain("disconnected");
});

it("ignores frames from previous bindings even after selecting the same device again", async () => {
  const first = device("one");
  const second = device("two");
  installRequest(vi.fn().mockResolvedValue(access(first, second)));
  const { result } = renderHook(useMidiInput);
  await act(async () => {
    await result.current.connect();
  });
  const oldFrame = first.onmidimessage!;
  act(() => result.current.choose("two"));
  act(() => oldFrame(note(60)));
  expect(result.current.snapshot.held).toEqual([]);
  await act(async () => result.current.choose("one"));
  act(() => oldFrame(note(60)));
  expect(result.current.snapshot.held).toEqual([]);
  act(() => first.onmidimessage?.(note(64)));
  expect(result.current.snapshot.held).toEqual([64]);
});

it("waits for a previous close before reconnecting the same MIDI port", async () => {
  const input = device("piano");
  const close = deferred<void>();
  input.close.mockReturnValueOnce(close.promise);
  installRequest(vi.fn().mockResolvedValue(access(input)));
  const { result } = renderHook(useMidiInput);
  await act(async () => {
    await result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    await result.current.connect();
  });
  expect(input.onmidimessage).toBeNull();
  expect(result.current.selected).toBe("");
  expect(result.current.status).toContain("Connecting to MIDI input");
  await act(async () => {
    close.resolve(undefined);
    await close.promise;
  });
  expect(result.current.selected).toBe("piano");
  act(() => input.onmidimessage?.(note(60)));
  expect(result.current.snapshot.held).toEqual([60]);
});

it("does not reattach a port when disconnected while waiting for its previous close", async () => {
  const input = device("piano");
  const close = deferred<void>();
  input.close.mockReturnValue(close.promise);
  installRequest(vi.fn().mockResolvedValue(access(input)));
  const { result } = renderHook(useMidiInput);
  await act(async () => {
    await result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    await result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    close.resolve(undefined);
    await close.promise;
  });
  expect(input.onmidimessage).toBeNull();
  expect(result.current.selected).toBe("");
  expect(result.current.inputs).toEqual([]);
});

it("preserves the first pending close through repeated disconnect and reconnect", async () => {
  const input = device("piano");
  const firstClose = deferred<void>();
  input.close
    .mockReturnValueOnce(firstClose.promise)
    .mockResolvedValue(undefined);
  installRequest(vi.fn().mockResolvedValue(access(input)));
  const { result } = renderHook(useMidiInput);
  await act(async () => {
    await result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    await result.current.connect();
  });
  act(() => result.current.disconnect());
  await act(async () => {
    await result.current.connect();
  });
  // An unnecessary second close would resolve early and incorrectly allow
  // this newest connection to bind while the original close is unfinished.
  expect(input.close).toHaveBeenCalledTimes(1);
  expect(input.onmidimessage).toBeNull();
  expect(result.current.selected).toBe("");
  await act(async () => {
    firstClose.resolve(undefined);
    await firstClose.promise;
  });
  expect(result.current.selected).toBe("piano");
  act(() => input.onmidimessage?.(note(65)));
  expect(result.current.snapshot.held).toEqual([65]);
});

it("ignores queued frames while hidden and permits a new request after visibility returns", async () => {
  const pending = deferred<MIDIAccess>();
  const input = device("piano");
  const midi = access(input);
  const request = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(midi);
  installRequest(request);
  const hidden = vi.spyOn(document, "hidden", "get");
  const { result } = renderHook(useMidiInput);
  let oldConnect!: Promise<void>;
  act(() => {
    oldConnect = result.current.connect();
  });
  act(() => {
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current.status).toContain("Enable MIDI to resume");
  hidden.mockReturnValue(false);
  await act(async () => {
    await result.current.connect();
  });
  await act(async () => {
    pending.resolve(access(device("stale")));
    await oldConnect;
  });
  const frame = input.onmidimessage!;
  // A queued note may arrive before the browser dispatches visibilitychange.
  act(() => {
    hidden.mockReturnValue(true);
    frame(note(60));
  });
  expect(result.current.snapshot.held).toEqual([]);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(input.onmidimessage).toBeNull();
  expect(midi.onstatechange).toBeNull();
  expect(result.current.inputs).toEqual([]);
});
