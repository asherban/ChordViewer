import { useState, useEffect, useMemo } from 'react';
import { WebMidi } from 'webmidi';
import {
  initMidi,
  getInputDescriptors,
  getInputById,
  attachNoteListeners,
  type MidiStatus,
  type MidiInputDescriptor,
} from './lib/midi';
import { detectChord } from './lib/chordDetect';
import { type Notation } from './lib/notation';
import { StatusMessage } from './components/StatusMessage';
import { DeviceSelector } from './components/DeviceSelector';
import { ChordDisplay } from './components/ChordDisplay';
import { StaffDisplay } from './components/StaffDisplay';

export default function App() {
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [notation, setNotation] = useState<Notation>('regular');

  const chordResult = useMemo(() => detectChord(activeNotes), [activeNotes]);

  // Initialize MIDI on mount
  useEffect(() => {
    let cancelled = false;

    initMidi().then((status) => {
      if (cancelled) return;
      setMidiStatus(status);

      if (status.kind !== 'ready') return;

      const descriptors = status.inputs;
      setInputs(descriptors);

      // Auto-select if exactly one device is available
      if (descriptors.length === 1) {
        setSelectedInputId(descriptors[0].id);
      }

      // Listen for device connect/disconnect
      const onConnectionChange = () => {
        const updated = getInputDescriptors();
        setInputs(updated);
        setSelectedInputId((prev) => {
          if (prev && !updated.find((i) => i.id === prev)) {
            // Previously selected device is gone
            setActiveNotes(new Set());
            return null;
          }
          // Auto-select if this is the first device appearing
          if (!prev && updated.length === 1) {
            return updated[0].id;
          }
          return prev;
        });
      };

      WebMidi.addListener('connected', onConnectionChange);
      WebMidi.addListener('disconnected', onConnectionChange);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Attach note listeners whenever the selected input changes
  useEffect(() => {
    if (!selectedInputId) return;

    const input = getInputById(selectedInputId);
    if (!input) return;

    // Clear stale notes from previous input
    setActiveNotes(new Set());

    const cleanup = attachNoteListeners(
      input,
      (midiNumber) => {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.add(midiNumber);
          return next;
        });
      },
      (midiNumber) => {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(midiNumber);
          return next;
        });
      }
    );

    return cleanup;
  }, [selectedInputId]);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">ChordViewer</h1>
      </header>

      <main className="app__main">
        {midiStatus === null && (
          <StatusMessage type="loading" message="Requesting MIDI access…" />
        )}

        {midiStatus?.kind === 'unsupported' && (
          <StatusMessage
            type="error"
            message="Your browser does not support the Web MIDI API. Please use Chrome, Edge, or another Chromium-based browser."
          />
        )}

        {midiStatus?.kind === 'error' && (
          <StatusMessage
            type="error"
            message={`Could not access MIDI devices: ${midiStatus.message}`}
          />
        )}

        {midiStatus?.kind === 'ready' && (
          <>
            {inputs.length === 0 ? (
              <StatusMessage
                type="warning"
                message="No MIDI devices detected. Plug in a device and it will appear automatically."
              />
            ) : (
              <DeviceSelector
                inputs={inputs}
                selectedInputId={selectedInputId}
                onSelect={setSelectedInputId}
              />
            )}

            {selectedInputId ? (
              <div className="app__content">
                <ChordDisplay result={chordResult} notation={notation} onNotationChange={setNotation} />
                <StaffDisplay activeNotes={activeNotes} />
              </div>
            ) : (
              inputs.length > 0 && (
                <StatusMessage type="info" message="Select a MIDI device above to begin." />
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
