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
import { loadChart, saveChart, emptyChart, type LeadSheet } from './lib/leadSheet';
import { StatusMessage } from './components/StatusMessage';
import { TopBar, type AppMode } from './components/TopBar';
import { LearnView } from './components/LearnView';
import { TranscribeView } from './components/TranscribeView';
import { PlayView } from './components/PlayView';
import { YouTubePanel } from './components/YouTubePanel';

const STORAGE_KEYS = {
  notation: 'chordviewer_notation',
  mode: 'chordviewer_mode',
  currentVideo: 'chordviewer_current_video',
  videoHistory: 'chordviewer_video_history',
} as const;

function loadStoredNotation(): Notation {
  const v = localStorage.getItem(STORAGE_KEYS.notation);
  return v === 'jazz' ? 'jazz' : 'regular';
}

function loadStoredMode(): AppMode {
  const v = localStorage.getItem(STORAGE_KEYS.mode);
  if (v === 'Transcribe' || v === 'Play') return v;
  return 'Learn';
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
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [physicalNotes, setPhysicalNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainPedalActive, setSustainPedalActive] = useState<boolean>(false);
  const sustainPedalActiveRef = useRef<boolean>(false);

  const [notation, setNotation] = useState<Notation>(loadStoredNotation);
  const [mode, setMode] = useState<AppMode>(loadStoredMode);
  const [chart, setChart] = useState<LeadSheet>(loadChart);

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

  // ── MIDI init ──────────────────────────────────────────────────────────────
  const onConnectionChangeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    initMidi().then((status) => {
      if (cancelled) return;
      setMidiStatus(status);
      if (status.kind !== 'ready') return;

      const descriptors = status.inputs;
      setInputs(descriptors);
      if (descriptors.length === 1) setSelectedInputId(descriptors[0].id);

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

      onConnectionChangeRef.current = onConnectionChange;
      WebMidi.addListener('connected', onConnectionChange);
      WebMidi.addListener('disconnected', onConnectionChange);
    });

    return () => {
      cancelled = true;
      if (onConnectionChangeRef.current) {
        WebMidi.removeListener('connected', onConnectionChangeRef.current);
        WebMidi.removeListener('disconnected', onConnectionChangeRef.current);
        onConnectionChangeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedInputId) return;
    const input = getInputById(selectedInputId);
    if (!input) return;

    setPhysicalNotes(new Set());
    setSustainedNotes(new Set());
    setSustainPedalActive(false);
    sustainPedalActiveRef.current = false;

    const cleanup = attachNoteListeners(
      input,
      (midiNumber) => {
        setPhysicalNotes((prev) => { const n = new Set(prev); n.add(midiNumber); return n; });
        setSustainedNotes((prev) => { if (!prev.has(midiNumber)) return prev; const n = new Set(prev); n.delete(midiNumber); return n; });
      },
      (midiNumber) => {
        setPhysicalNotes((prev) => { const n = new Set(prev); n.delete(midiNumber); return n; });
        if (sustainPedalActiveRef.current) {
          setSustainedNotes((prev) => { const n = new Set(prev); n.add(midiNumber); return n; });
        }
      },
      (active) => {
        sustainPedalActiveRef.current = active;
        setSustainPedalActive(active);
        if (!active) setSustainedNotes(new Set());
      }
    );
    return cleanup;
  }, [selectedInputId]);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.notation, notation); }, [notation]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.mode, mode); }, [mode]);
  useEffect(() => { saveChart(chart); }, [chart]);

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

  useEffect(() => {
    videoHistory
      .filter((e) => !e.title)
      .forEach((entry) => {
        fetchVideoTitle(entry.id).then((title) => {
          if (title) setVideoHistory((prev) => prev.map((e) => e.id === entry.id ? { ...e, title } : e));
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const midiConnected = selectedInputId !== null;
  const selectedDevice = inputs.find((i) => i.id === selectedInputId);

  return (
    <div className={`app${mode !== 'Learn' ? ' app--fullbleed' : ''}`}>
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
              if (title) setVideoHistory((prev) => prev.map((e) => e.id === id ? { ...e, title } : e));
            });
          }
        }}
        onClearVideo={() => { setYoutubeVideoId(null); setYoutubeStartSec(null); }}
        onDeleteFromHistory={(id) => setVideoHistory((prev) => prev.filter((e) => e.id !== id))}
        mode={mode}
        onModeChange={setMode}
        notation={notation}
        onNotationChange={setNotation}
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

        {/* Persistent wrapper keeps YouTubePanel mounted across Learn ↔ Transcribe switches */}
        {mode !== 'Play' && (
          <div className={`app__view-container${youtubeVideoId ? ' app__view-container--split' : ''}`}>
            <div className="app__view-container__content">
              {mode === 'Learn' && (
                selectedInputId ? (
                  <LearnView
                    chordResult={chordResult}
                    activeNotes={activeNotes}
                    sustainPedalActive={sustainPedalActive}
                    notation={notation}
                  />
                ) : (
                  midiStatus?.kind === 'ready' && inputs.length > 0 && (
                    <StatusMessage type="info" message="Select a MIDI device to begin." />
                  )
                )
              )}
              {mode === 'Transcribe' && (
                <TranscribeView
                  chart={chart}
                  onChartChange={setChart}
                  onClearChart={() => setChart(emptyChart())}
                  chordResult={chordResult}
                  chordHistory={chordHistory}
                  notation={notation}
                  midiDeviceName={selectedDevice?.name ?? null}
                  midiConnected={midiConnected}
                />
              )}
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
        )}

        {mode === 'Play' && (
          <PlayView
            chart={chart}
            chordResult={chordResult}
            notation={notation}
            midiConnected={midiConnected}
          />
        )}
      </main>
    </div>
  );
}
