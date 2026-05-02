'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { WebMidi } from 'webmidi';
import {
  initMidi,
  getInputDescriptors,
  getInputById,
  attachNoteListeners,
  type MidiStatus,
  type MidiInputDescriptor,
} from '../lib/midi';
import { detectChord } from '../lib/chordDetect';
import { type Notation } from '../lib/notation';
import { type VideoHistoryEntry, fetchVideoTitle } from '../lib/youtube';
import { useChordHistory } from '../lib/useChordHistory';
import { emptyChart, type LeadSheet } from '../lib/leadSheet';
import { createClient } from '@/lib/supabase/client';
import {
  pullChart, pushChart,
  defaultPreferences,
  pullPreferences, pushPreferences,
  pullVideoHistory, pushVideoHistory,
} from '@/lib/sync';
import { StatusMessage } from './StatusMessage';
import { TopBar, type AppMode } from './TopBar';
import { LearnView } from './LearnView';
import { TranscribeView } from './TranscribeView';
import { PlayView } from './PlayView';
import { YouTubePanel } from './YouTubePanel';

const INITIAL_PREFERENCES = defaultPreferences();

function addToHistory(entry: VideoHistoryEntry, history: VideoHistoryEntry[]): VideoHistoryEntry[] {
  const existing = history.find((h) => h.id === entry.id);
  const merged = existing?.title && !entry.title ? { ...entry, title: existing.title } : entry;
  const deduped = history.filter((h) => h.id !== entry.id);
  return [merged, ...deduped].slice(0, 5);
}

export function ChordViewerApp() {
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [physicalNotes, setPhysicalNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainPedalActive, setSustainPedalActive] = useState<boolean>(false);
  const sustainPedalActiveRef = useRef<boolean>(false);

  const [notation, setNotation] = useState<Notation>(INITIAL_PREFERENCES.notation);
  const [mode, setMode] = useState<AppMode>(INITIAL_PREFERENCES.mode);
  const [chart, setChart] = useState<LeadSheet>(emptyChart);

  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(INITIAL_PREFERENCES.currentVideo?.id ?? null);
  const [youtubeStartSec, setYoutubeStartSec] = useState<number | null>(INITIAL_PREFERENCES.currentVideo?.startSec ?? null);
  const [videoHistory, setVideoHistory] = useState<VideoHistoryEntry[]>([]);

  const transcribePaletteTapRef = useRef<((chord: string) => void) | null>(null);
  // Prevents pushing in-memory defaults to Supabase before the initial pull completes.
  const isSyncedRef = useRef(false);
  const syncedChartSnapshotRef = useRef<string | null>(null);
  const syncedPreferencesSnapshotRef = useRef<string | null>(null);
  const syncedHistorySnapshotRef = useRef<string | null>(null);

  const activeNotes = useMemo(
    () => new Set([...physicalNotes, ...sustainedNotes]),
    [physicalNotes, sustainedNotes]
  );
  const chordResult = useMemo(() => detectChord(activeNotes), [activeNotes]);
  const chordHistory = useChordHistory(chordResult.chord, {
    maxHistory: 4,
    stabilityMs: 600,
  });

  const onConnectionChangeRef = useRef<(() => void) | null>(null);

  // On mount: pull database state, reconcile, then enable push effects.
  useEffect(() => {
    let cancelled = false;

    async function pull() {
      const [cloudChart, cloudPreferences, cloudHistory] = await Promise.all([
        pullChart(), pullPreferences(), pullVideoHistory(),
      ]);
      if (cancelled) return;

      syncedChartSnapshotRef.current = JSON.stringify(cloudChart);
      syncedPreferencesSnapshotRef.current = JSON.stringify(cloudPreferences);
      syncedHistorySnapshotRef.current = JSON.stringify(cloudHistory);

      setChart(cloudChart);
      setNotation(cloudPreferences.notation);
      setMode(cloudPreferences.mode);
      setYoutubeVideoId(cloudPreferences.currentVideo?.id ?? null);
      setYoutubeStartSec(cloudPreferences.currentVideo?.startSec ?? null);
      setVideoHistory(cloudHistory);
      isSyncedRef.current = true;
    }
    pull();

    return () => {
      cancelled = true;
    };
  }, []);

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
    return () => {
      cleanup();
      setPhysicalNotes(new Set());
      setSustainedNotes(new Set());
      setSustainPedalActive(false);
      sustainPedalActiveRef.current = false;
    };
  }, [selectedInputId]);

  useEffect(() => {
    if (!isSyncedRef.current) return;

    const preferences = {
      notation,
      mode,
      currentVideo: youtubeVideoId ? { id: youtubeVideoId, startSec: youtubeStartSec } : null,
    };
    const snapshot = JSON.stringify(preferences);
    if (snapshot === syncedPreferencesSnapshotRef.current) {
      syncedPreferencesSnapshotRef.current = null;
      return;
    }

    pushPreferences(preferences);
  }, [notation, mode, youtubeVideoId, youtubeStartSec]);

  useEffect(() => {
    if (!isSyncedRef.current) return;

    const snapshot = JSON.stringify(chart);
    if (snapshot === syncedChartSnapshotRef.current) {
      syncedChartSnapshotRef.current = null;
      return;
    }

    pushChart(chart);
  }, [chart]);

  useEffect(() => {
    if (!isSyncedRef.current) return;

    const snapshot = JSON.stringify(videoHistory);
    if (snapshot === syncedHistorySnapshotRef.current) {
      syncedHistorySnapshotRef.current = null;
      return;
    }

    pushVideoHistory(videoHistory);
  }, [videoHistory]);

  useEffect(() => {
    videoHistory
      .filter((e) => !e.title)
      .forEach((entry) => {
        fetchVideoTitle(entry.id).then((title) => {
          if (title) setVideoHistory((prev) => prev.map((e) => e.id === entry.id ? { ...e, title } : e));
        });
      });
  }, [videoHistory]);

  const midiConnected = selectedInputId !== null;
  const selectedDevice = inputs.find((i) => i.id === selectedInputId);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

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
        onSignOut={handleSignOut}
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

        {mode !== 'Play' && (
          <div className={`app__view-container${youtubeVideoId ? ' app__view-container--split' : ''}`}>
            <div className="app__view-container__content">
              {mode === 'Learn' && (
                <>
                  <LearnView
                    chordResult={chordResult}
                    activeNotes={activeNotes}
                    sustainPedalActive={sustainPedalActive}
                    notation={notation}
                  />
                  {!selectedInputId && midiStatus?.kind === 'ready' && inputs.length > 0 && (
                    <StatusMessage type="info" message="Select a MIDI device to begin." />
                  )}
                </>
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
                  hasVideo={!!youtubeVideoId}
                  paletteTapRef={transcribePaletteTapRef}
                />
              )}
            </div>
            {youtubeVideoId && (
              <YouTubePanel
                videoId={youtubeVideoId}
                startSec={youtubeStartSec}
                history={chordHistory}
                notation={notation}
                onChordTap={mode === 'Transcribe' ? (chord) => transcribePaletteTapRef.current?.(chord) : undefined}
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
