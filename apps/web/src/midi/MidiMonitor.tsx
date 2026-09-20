import { useEffect, useRef, useState } from "react";
import { detectChord } from "../music/chordDetect";
import { toJazzNotation } from "../music/notation";
import { emptySnapshot, MidiState, noteLabel } from "./state";

export function MidiMonitor() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState(
    "Connect a MIDI input to see what you play.",
  );
  const access = useRef<MIDIAccess | null>(null);
  const input = useRef<MIDIInput | null>(null);
  const state = useRef(new MidiState());
  const mounted = useRef(false);
  const pending = useRef(false);
  const requestEpoch = useRef({ value: 0 });

  function clearInput() {
    if (input.current) {
      input.current.onmidimessage = null;
      void input.current.close();
    }
    input.current = null;
    setSelected("");
    setSnapshot(state.current.reset());
  }
  function choose(id: string) {
    // Closing and immediately reattaching the same port races the browser's async close.
    if (input.current?.id === id && input.current.state === "connected") return;
    clearInput();
    if (document.hidden) return;
    const device = access.current?.inputs.get(id);
    if (!device || device.state !== "connected") return;
    input.current = device;
    setSelected(id);
    device.onmidimessage = (event) => {
      if (event.data) setSnapshot(state.current.receive([...event.data]));
    };
    setStatus("Listening locally. MIDI does not change this example score.");
  }
  async function connect() {
    if (pending.current) return;
    if (!navigator.requestMIDIAccess) {
      setStatus("Use Chrome or Edge on localhost for MIDI input.");
      return;
    }
    pending.current = true;
    const epoch = ++requestEpoch.current.value;
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false });
      if (!mounted.current || document.hidden || epoch !== requestEpoch.current.value)
        return;
      if (access.current) access.current.onstatechange = null;
      access.current = midi;
      const update = () => {
        setInputs(
          [...midi.inputs.values()].filter(
            (device) => device.state === "connected",
          ),
        );
        if (input.current?.state === "disconnected") {
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
      else setStatus("MIDI access granted. No input devices found.");
    } catch {
      if (mounted.current)
        setStatus(
          "MIDI access was not granted. Allow it in browser site settings, then retry.",
        );
    } finally {
      pending.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    const midiState = state.current;
    const requests = requestEpoch.current;
    const hide = () => {
      if (document.hidden) {
        requests.value++;
        if (input.current) {
          input.current.onmidimessage = null;
          void input.current.close();
        }
        input.current = null;
        setSelected("");
        setSnapshot(midiState.reset());
        setStatus(
          "MIDI paused while the page was hidden. Select your input to resume.",
        );
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      requests.value++;
      document.removeEventListener("visibilitychange", hide);
      if (access.current) access.current.onstatechange = null;
      if (input.current) {
        input.current.onmidimessage = null;
        void input.current.close();
      }
      input.current = null;
      midiState.reset();
    };
  }, []);
  const chord = detectChord(
    new Set(snapshot.sounding.map((note) => note % 128)),
  ).chord;
  return (
    <section className="midi-card" aria-label="Live MIDI">
      <div className="eyebrow">
        AT YOUR KEYS{" "}
        <span className={selected ? "status-dot connected" : "status-dot"} />
      </div>
      <h2>What you’re playing</h2>
      <div className="played-chord" aria-live="polite">
        {chord ? toJazzNotation(chord) : "—"}
      </div>
      <p className="note-label">Held notes</p>
      <p data-testid="held-notes" className="note-list">
        {snapshot.held.map(noteLabel).join(" / ") || "None"}
      </p>
      <p className="note-label">Sounding notes</p>
      <p data-testid="sounding-notes" className="note-list">
        {snapshot.sounding.map(noteLabel).join(" / ") || "None"}
      </p>
      <p className="small">
        Sustain:{" "}
        {snapshot.sustainChannels.length
          ? snapshot.sustainChannels.map((ch) => `ch ${ch + 1}`).join(", ")
          : "Off"}{" "}
        · {snapshot.messages} messages
      </p>
      <button className="secondary" onClick={() => void connect()}>
        Enable MIDI
      </button>
      {inputs.length > 0 && (
        <label className="device-label">
          MIDI input
          <select
            value={selected}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">Disconnected</option>
            {inputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name || "MIDI input"}
              </option>
            ))}
          </select>
        </label>
      )}
      <p role="status" className="small">
        {status}
      </p>
    </section>
  );
}
