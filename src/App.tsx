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
import { type VideoHistoryEntry, fetchVideoTitle } from './lib/youtube';
import { useChordHistory } from './lib/useChordHistory';
import { StatusMessage } from './components/StatusMessage';
import { TopBar } from './components/TopBar';
import { ChordDisplay } from './components/ChordDisplay';
import { StaffDisplay } from './components/StaffDisplay';
import { YouTubePanel } from './components/YouTubePanel';

const STORAGE_KEYS = {
  notation: 'chordviewer_notation',
  currentVideo: 'chordviewer_current_video',
  videoHistory: 'chordviewer_video_history',
} as const;

function loadStoredNotation(): Notation {
  const v = localStorage.getItem(STORAGE_KEYS.notation);
  return v === 'jazz' ? 'jazz' : 'regular';
}

function loadStoredCurrentVideo(): { id: string; startSec: number | null } | null {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.currentVideo);
    return v ? (JSON.parse(v) as { id: string; startSec: number | null }) : null;
  } catch {
    return null;
  }
}

function loadStoredVideoHistory(): VideoHistoryEntry[] {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.videoHistory);
    return v ? (JSON.parse(v) as VideoHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function addToHistory(entry: VideoHistoryEntry, history: VideoHistoryEntry[]): VideoHistoryEntry[] {
  const existing = history.find((h) => h.id === entry.id);
  const merged = existing?.title && !entry.title ? { ...entry, title: existing.title } : entry;
  const deduped = history.filter((h) => h.id !== entry.id);
  return [merged, ...deduped].slice(0, 5);
}

export default function App() {
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [isRetryingMidi, setIsRetryingMidi] = useState(false);
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [physicalNotes, setPhysicalNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainPedalActive, setSustainPedalActive] = useState<boolean>(false);
  const sustainPedalActiveRef = useRef<boolean>(false);
  const midiListenersSetRef = useRef<boolean>(false);
  const [notation, setNotation] = useState<Notation>(loadStoredNotation);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(() => loadStoredCurrentVideo()?.id ?? null);
  const [youtubeStartSec, setYoutubeStartSec] = useState<number | null>(() => loadStoredCurrentVideo()?.startSec ?? null);
  const [videoHistory, setVideoHistory] = useState<VideoHistoryEntry[]>(loadStoredVideoHistory);

  const activeNotes = useMemo(
    () => new Set([...physicalNotes, ...sustainedNotes]),
    [physicalNotes, sustainedNotes]
  );
  const chordResult = useMemo(() => detectChord(activeNotes), [activeNotes]);
  const chordHistory = useChordHistory(chordResult.chord, {
    maxHistory: 4,
    stabilityMs: 600,
  });

  function setupMidiReady(descriptors: MidiInputDescriptor[]) {
    setInputs(descriptors);
    if (descriptors.length === 1) setSelectedInputId(descriptors[0].id);

    if (!midiListenersSetRef.current) {
      midiListenersSetRef.current = true;
      const onConnectionChange = () => {
        const updated = getInputDescriptors();
        setInputs(updated);
        setSelectedInputId((prev) => {
          if (prev && !updated.find((i) => i.id === prev)) {
            setPhysicalNotes(new Set());
            setSustainedNotes(new Set());
            setSustainPedalActive(false);
            sustainPedalActiveRef.current = false;
            return null;
          }
          if (!prev && updated.length === 1) return updated[0].id;
          return prev;
        });
      };
      WebMidi.addListener('connected', onConnectionChange);
      WebMidi.addListener('disconnected', onConnectionChange);
    }
  }

  // Initialize MIDI on mount
  useEffect(() => {
    let cancelled = false;

    initMidi().then((status) => {
      if (cancelled) return;
      setMidiStatus(status);
      if (status.kind === 'ready') setupMidiReady(status.inputs);
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetryMidi() {
    setIsRetryingMidi(true);

    // Reset WebMidi's internal state so enable() doesn't short-circuit if it
    // was left partially-initialized, and so a fresh MIDI access is requested.
    if (WebMidi.enabled) {
      try {
        await WebMidi.disable();
      } catch {
        // ignore
      }
      midiListenersSetRef.current = false;
    }

    // Ensure the loading indicator is visible for at least a moment so users
    // see feedback even when the browser rejects the request instantly.
    const [status] = await Promise.all([
      initMidi(),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);

    setIsRetryingMidi(false);
    setMidiStatus(status);
    if (status.kind === 'ready') setupMidiReady(status.inputs);
  }

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

  // Fetch titles for any history entries that don't have one yet
  useEffect(() => {
    videoHistory
      .filter((e) => !e.title)
      .forEach((entry) => {
        fetchVideoTitle(entry.id).then((title) => {
          if (title) {
            setVideoHistory((prev) => prev.map((e) => e.id === entry.id ? { ...e, title } : e));
          }
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.notation, notation);
  }, [notation]);

  useEffect(() => {
    if (youtubeVideoId !== null) {
      localStorage.setItem(STORAGE_KEYS.currentVideo, JSON.stringify({ id: youtubeVideoId, startSec: youtubeStartSec }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentVideo);
    }
  }, [youtubeVideoId, youtubeStartSec]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.videoHistory, JSON.stringify(videoHistory));
  }, [videoHistory]);

  return (
    <div className="app">
      <TopBar
        midiStatus={midiStatus}
        inputs={inputs}
        selectedInputId={selectedInputId}
        onSelectInput={setSelectedInputId}
        videoId={youtubeVideoId}
        videoHistory={videoHistory}
        onLoadVideo={(id, startSec, label) => {
          setYoutubeVideoId(id);
          setYoutubeStartSec(startSec);
          setVideoHistory((prev) => addToHistory({ id, startSec, label }, prev));
          const alreadyHasTitle = videoHistory.find((e) => e.id === id)?.title;
          if (!alreadyHasTitle) {
            fetchVideoTitle(id).then((title) => {
              if (title) {
                setVideoHistory((prev) => prev.map((e) => e.id === id ? { ...e, title } : e));
              }
            });
          }
        }}
        onClearVideo={() => {
          setYoutubeVideoId(null);
          setYoutubeStartSec(null);
        }}
        onDeleteFromHistory={(id) => {
          setVideoHistory((prev) => prev.filter((e) => e.id !== id));
        }}
      />

      <main className="app__main">
        {midiStatus?.kind === 'unsupported' && (
          <StatusMessage
            type="error"
            message="Your browser does not support the Web MIDI API. Please use Chrome, Edge, or another Chromium-based browser."
          />
        )}

        {isRetryingMidi && (
          <StatusMessage type="loading" message="Requesting MIDI permission…" />
        )}

        {!isRetryingMidi && midiStatus?.kind === 'error' && (
          <StatusMessage
            type="error"
            message={`Could not access MIDI devices: ${midiStatus.message}. If the browser has blocked MIDI, reset it via the address-bar lock/tune icon → Site settings → MIDI → Allow, then click below.`}
            action={{ label: 'Request Permission', onClick: handleRetryMidi }}
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
