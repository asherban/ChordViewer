import { useState, useEffect, useMemo, useRef } from 'react';
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
import { useChordHistory } from './lib/useChordHistory';
import { StatusMessage } from './components/StatusMessage';
import { TopBar } from './components/TopBar';
import { ChordDisplay } from './components/ChordDisplay';
import { StaffDisplay } from './components/StaffDisplay';
import { YouTubePanel } from './components/YouTubePanel';

export default function App() {
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [physicalNotes, setPhysicalNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainPedalActive, setSustainPedalActive] = useState<boolean>(false);
  const sustainPedalActiveRef = useRef<boolean>(false);
  const [notation, setNotation] = useState<Notation>('regular');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeStartSec, setYoutubeStartSec] = useState<number | null>(null);

  const activeNotes = useMemo(
    () => new Set([...physicalNotes, ...sustainedNotes]),
    [physicalNotes, sustainedNotes]
  );
  const chordResult = useMemo(() => detectChord(activeNotes), [activeNotes]);
  const chordHistory = useChordHistory(chordResult.chord, {
    maxHistory: 4,
    stabilityMs: 600,
  });

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
            setPhysicalNotes(new Set());
            setSustainedNotes(new Set());
            setSustainPedalActive(false);
            sustainPedalActiveRef.current = false;
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
    setPhysicalNotes(new Set());
    setSustainedNotes(new Set());
    setSustainPedalActive(false);
    sustainPedalActiveRef.current = false;

    const cleanup = attachNoteListeners(
      input,
      (midiNumber) => {
        setPhysicalNotes((prev) => {
          const next = new Set(prev);
          next.add(midiNumber);
          return next;
        });
        setSustainedNotes((prev) => {
          if (!prev.has(midiNumber)) return prev;
          const next = new Set(prev);
          next.delete(midiNumber);
          return next;
        });
      },
      (midiNumber) => {
        setPhysicalNotes((prev) => {
          const next = new Set(prev);
          next.delete(midiNumber);
          return next;
        });
        if (sustainPedalActiveRef.current) {
          setSustainedNotes((prev) => {
            const next = new Set(prev);
            next.add(midiNumber);
            return next;
          });
        }
      },
      (active) => {
        sustainPedalActiveRef.current = active;
        setSustainPedalActive(active);
        if (!active) {
          setSustainedNotes(new Set());
        }
      }
    );

    return cleanup;
  }, [selectedInputId]);

  return (
    <div className="app">
      <TopBar
        midiStatus={midiStatus}
        inputs={inputs}
        selectedInputId={selectedInputId}
        onSelectInput={setSelectedInputId}
        videoId={youtubeVideoId}
        onLoadVideo={(id, startSec) => {
          setYoutubeVideoId(id);
          setYoutubeStartSec(startSec);
        }}
        onClearVideo={() => {
          setYoutubeVideoId(null);
          setYoutubeStartSec(null);
        }}
      />

      <main className="app__main">
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

        {selectedInputId ? (
          <div className={`app__content${youtubeVideoId ? ' app__content--split' : ''}`}>
            <div className="app__content__left">
              <ChordDisplay result={chordResult} notation={notation} onNotationChange={setNotation} sustainPedalActive={sustainPedalActive} />
              <StaffDisplay activeNotes={activeNotes} />
            </div>
            {youtubeVideoId && (
              <YouTubePanel
                videoId={youtubeVideoId}
                startSec={youtubeStartSec}
                history={chordHistory}
                notation={notation}
              />
            )}
          </div>
        ) : (
          midiStatus?.kind === 'ready' && inputs.length > 0 && (
            <StatusMessage type="info" message="Select a MIDI device to begin." />
          )
        )}
      </main>
    </div>
  );
}
