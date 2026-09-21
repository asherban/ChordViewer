import { useEffect, useRef, useState } from "react";
import { emptySnapshot, MidiState } from "./state";

interface MidiConnection {
  mounted: boolean;
  pending: boolean;
  request: number;
  binding: number;
  access: MIDIAccess | null;
  input: MIDIInput | null;
  closing: WeakMap<MIDIInput, Promise<void>>;
}

function detachInput(connection: MidiConnection) {
  connection.binding++;
  const previous = connection.input;
  connection.input = null;
  if (previous) {
    previous.onmidimessage = null;
    // A port can be selected while its earlier close is still pending. Keep
    // that original completion as the boundary for any later reconnection.
    if (connection.closing.has(previous)) return;
    const closing = previous.close().then(
      () => {},
      () => {},
    );
    connection.closing.set(previous, closing);
    void closing.then(() => {
      if (connection.closing.get(previous) === closing)
        connection.closing.delete(previous);
    });
  }
}

function detachAccess(connection: MidiConnection) {
  connection.request++;
  connection.pending = false;
  if (connection.access) connection.access.onstatechange = null;
  connection.access = null;
  detachInput(connection);
}

export function useMidiInput() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState(
    "Connect a MIDI input to see what you play.",
  );
  const state = useRef(new MidiState());
  const connection = useRef<MidiConnection>({
    mounted: false,
    pending: false,
    request: 0,
    binding: 0,
    access: null,
    input: null,
    closing: new WeakMap(),
  });

  function clearInput() {
    detachInput(connection.current);
    setSelected("");
    setSnapshot(state.current.reset());
  }
  function disconnect() {
    detachAccess(connection.current);
    setInputs([]);
    setSelected("");
    setSnapshot(state.current.reset());
    setStatus("MIDI disconnected. Enable MIDI to reconnect.");
  }
  function choose(id: string) {
    if (!id) {
      disconnect();
      return;
    }
    const current = connection.current;
    const device = current.access?.inputs.get(id);
    // Keep the active listener when reselecting the same port; closing and
    // immediately reattaching it would race the browser's asynchronous close.
    if (device === current.input && device?.state === "connected") return;
    clearInput();
    if (
      !current.mounted ||
      document.hidden ||
      !device ||
      device.state !== "connected"
    )
      return;
    current.input = device;
    const binding = current.binding;
    const attach = () => {
      if (
        !current.mounted ||
        current.input !== device ||
        current.binding !== binding ||
        document.hidden ||
        device.state !== "connected"
      )
        return;
      setSelected(id);
      device.onmidimessage = (event) => {
        if (
          current.mounted &&
          current.input === device &&
          current.binding === binding &&
          !document.hidden &&
          event.data
        ) {
          setSnapshot(state.current.receive([...event.data]));
        }
      };
      setStatus("Listening locally. Your saved score stays unchanged.");
    };
    const closing = current.closing.get(device);
    if (closing) {
      setStatus("Connecting to MIDI input…");
      // An earlier asynchronous close must finish before assigning a new
      // listener, which implicitly opens this same port again.
      void closing.then(attach);
    } else attach();
  }
  async function connect() {
    const current = connection.current;
    if (current.pending || !current.mounted || document.hidden) return;
    if (!navigator.requestMIDIAccess) {
      setStatus("Use Chrome or Edge on localhost for MIDI input.");
      return;
    }
    current.pending = true;
    const request = ++current.request;
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false });
      if (!current.mounted || document.hidden || request !== current.request)
        return;
      if (current.access) current.access.onstatechange = null;
      current.access = midi;
      const update = () => {
        if (
          !current.mounted ||
          current.access !== midi ||
          request !== current.request ||
          document.hidden
        )
          return;
        setInputs(
          [...midi.inputs.values()].filter(
            (device) => device.state === "connected",
          ),
        );
        if (current.input?.state === "disconnected") {
          clearInput();
          setStatus(
            "MIDI input disconnected. Select a connected input to resume.",
          );
        }
      };
      midi.onstatechange = update;
      update();
      const first = [...midi.inputs.values()].find(
        (device) => device.state === "connected",
      );
      if (first) choose(first.id);
      else {
        clearInput();
        setStatus("MIDI access granted. No input devices found.");
      }
    } catch {
      if (current.mounted && request === current.request && !document.hidden) {
        disconnect();
        setStatus(
          "MIDI access was not granted. Allow it in browser site settings, then retry.",
        );
      }
    } finally {
      // A superseded permission result must not unlock a newer in-flight request.
      if (request === current.request) current.pending = false;
    }
  }
  useEffect(() => {
    const current = connection.current;
    const midiState = state.current;
    current.mounted = true;
    const hide = () => {
      if (document.hidden) {
        detachAccess(current);
        setInputs([]);
        setSelected("");
        setSnapshot(midiState.reset());
        setStatus(
          "MIDI paused while the page was hidden. Enable MIDI to resume.",
        );
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      current.mounted = false;
      document.removeEventListener("visibilitychange", hide);
      detachAccess(current);
      midiState.reset();
    };
  }, []);
  return { snapshot, inputs, selected, status, connect, choose, disconnect };
}

export type MidiInputModel = ReturnType<typeof useMidiInput>;
