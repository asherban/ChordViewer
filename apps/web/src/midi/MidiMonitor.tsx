import { detectChord } from "../music/chordDetect";
import { toJazzNotation } from "../music/notation";
import { noteLabel } from "./state";
import type { MidiInputModel } from "./useMidiInput";

export function MidiMonitor({ midi }: { midi: MidiInputModel }) {
  const { snapshot, inputs, selected, status, connect, choose } = midi;
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
