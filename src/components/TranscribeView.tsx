import { useEffect, useRef, useState } from 'react';
import { Bar } from './Bar';
import { ChordPill } from './ChordPill';
import type { ChordResult } from '../lib/chordDetect';
import type { Notation } from '../lib/notation';
import type { ChordHistoryEntry } from '../lib/useChordHistory';
import type { LeadSheet } from '../lib/leadSheet';

interface Armed {
  bar: number;
  slot: number;
}

interface Props {
  chart: LeadSheet;
  onChartChange: (chart: LeadSheet) => void;
  onClearChart: () => void;
  chordResult: ChordResult;
  chordHistory: ChordHistoryEntry[];
  notation: Notation;
  midiDeviceName: string | null;
  midiConnected: boolean;
}

// Find next empty slot in reading order from (bar, slot), inclusive.
function findNextEmpty(bars: (string | null)[][], fromBar: number, fromSlot: number): Armed | null {
  for (let b = fromBar; b < bars.length; b++) {
    const startSlot = b === fromBar ? fromSlot : 0;
    for (let s = startSlot; s < bars[b].length; s++) {
      if (!bars[b][s]) return { bar: b, slot: s };
    }
  }
  return null;
}

export function TranscribeView({
  chart,
  onChartChange,
  onClearChart,
  chordResult,
  chordHistory,
  notation,
  midiDeviceName,
  midiConnected,
}: Props) {
  const { meta, bars } = chart;

  // Armed slot cursor — starts at bar 0 slot 0
  const [armed, setArmed] = useState<Armed>({ bar: 0, slot: 0 });

  // MIDI commit debounce state
  const commitTimerRef = useRef<number | null>(null);
  const pendingChordRef = useRef<string | null>(null);
  // Whether we already committed a chord and are waiting for keys-up
  const waitingForReleaseRef = useRef(false);

  // Fill the armed slot with a chord, then advance armed
  function fillAndAdvance(chord: string, armed: Armed, bars: (string | null)[][], advanceWhole: boolean) {
    const next = bars.map((b) => b.slice());
    next[armed.bar][armed.slot] = chord;

    // If advanceWhole (MIDI path), jump to first slot of next bar
    // Otherwise (palette tap / interior slot path), find next empty in reading order
    let nextArmed: Armed | null;
    if (advanceWhole) {
      const nextBar = armed.bar + 1;
      if (nextBar >= next.length) {
        next.push([null, null, null, null]);
      }
      nextArmed = { bar: nextBar, slot: 0 };
    } else {
      nextArmed = findNextEmpty(next, armed.bar, armed.slot + 1);
      if (!nextArmed) {
        const newBarIdx = next.length;
        next.push([null, null, null, null]);
        nextArmed = { bar: newBarIdx, slot: 0 };
      }
    }

    onChartChange({ ...chart, bars: next });
    setArmed(nextArmed);
  }

  // Chord detection → commit (450ms stable, then wait for release)
  useEffect(() => {
    const chord = chordResult.chord;

    if (!chord) {
      // Keys released → clear pending, allow next commit
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      pendingChordRef.current = null;
      waitingForReleaseRef.current = false;
      return;
    }

    if (waitingForReleaseRef.current) return;
    if (pendingChordRef.current === chord) return;

    // New chord detected — start stability timer
    pendingChordRef.current = chord;
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);

    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      const c = pendingChordRef.current;
      if (!c || c !== chord) return;
      // Commit: armed is read from state at the time of the timeout via closure capture.
      // We use a ref-based approach below to avoid stale closure.
      setArmed((currentArmed) => {
        const nextBars = bars.map((b) => b.slice());
        nextBars[currentArmed.bar][currentArmed.slot] = c;

        const nextBar = currentArmed.bar + 1;
        if (nextBar >= nextBars.length) {
          nextBars.push([null, null, null, null]);
        }
        const nextArmed: Armed = { bar: nextBar, slot: 0 };

        onChartChange({ ...chart, bars: nextBars });
        waitingForReleaseRef.current = true;
        return nextArmed;
      });
    }, 450);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordResult.chord]);

  // Keyboard: Backspace/Delete clears the armed slot
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (bars[armed.bar]?.[armed.slot]) {
          const next = bars.map((b) => b.slice());
          next[armed.bar][armed.slot] = null;
          onChartChange({ ...chart, bars: next });
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, bars, chart, onChartChange]);

  function handleSlotClick(barIdx: number, slotIdx: number) {
    setArmed({ bar: barIdx, slot: slotIdx });
  }

  function handleDelete(barIdx: number, slotIdx: number) {
    const next = bars.map((b) => b.slice());
    next[barIdx][slotIdx] = null;
    onChartChange({ ...chart, bars: next });
    setArmed({ bar: barIdx, slot: slotIdx });
  }

  function handlePaletteTap(chord: string) {
    fillAndAdvance(chord, armed, bars, false);
  }

  function updateMeta(key: keyof typeof meta, value: string) {
    onChartChange({ ...chart, meta: { ...meta, [key]: value } });
  }

  const recentChords = chordHistory.map((e) => e.chord);

  return (
    <div className="transcribe-view">
      {/* Meta header */}
      <div className="transcribe-meta">
        <label className="transcribe-meta__field transcribe-meta__field--title">
          <span className="transcribe-meta__label">Title</span>
          <input
            className="transcribe-meta__input transcribe-meta__input--title"
            value={meta.title}
            onChange={(e) => updateMeta('title', e.target.value)}
            placeholder="Untitled"
          />
        </label>
        <label className="transcribe-meta__field">
          <span className="transcribe-meta__label">Key</span>
          <input
            className="transcribe-meta__input"
            value={meta.key}
            onChange={(e) => updateMeta('key', e.target.value)}
            placeholder="—"
          />
        </label>
        <label className="transcribe-meta__field">
          <span className="transcribe-meta__label">Time</span>
          <input
            className="transcribe-meta__input"
            value={meta.time}
            onChange={(e) => updateMeta('time', e.target.value)}
            placeholder="4/4"
          />
        </label>
        <label className="transcribe-meta__field">
          <span className="transcribe-meta__label">Tempo</span>
          <input
            className="transcribe-meta__input"
            value={meta.tempo}
            onChange={(e) => updateMeta('tempo', e.target.value)}
            placeholder="120"
          />
        </label>
      </div>

      <div className="transcribe-body">
        {/* Main bar grid */}
        <div className="transcribe-main">
          <div className="transcribe-bars">
            {bars.map((bar, barIdx) => (
              <Bar
                key={barIdx}
                bar={bar}
                barIdx={barIdx}
                notation={notation}
                armedSlot={armed.bar === barIdx ? armed.slot : undefined}
                onSlotClick={handleSlotClick}
                onDelete={handleDelete}
                fontSize={22}
                minHeight={78}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="transcribe-footer">
            <div className="transcribe-footer__midi">
              <span
                className={`transcribe-footer__dot ${midiConnected ? 'transcribe-footer__dot--on' : ''}`}
              />
              {midiConnected
                ? `MIDI · ${midiDeviceName ?? 'connected'}`
                : 'No MIDI device'}
            </div>
            <button className="transcribe-footer__clear" onClick={onClearChart}>
              Clear chart
            </button>
          </div>
        </div>

        {/* Right rail */}
        <div className="transcribe-rail">
          {recentChords.length > 0 && (
            <div className="transcribe-rail__section">
              <div className="transcribe-rail__label">Last 4 chords</div>
              <div className="transcribe-rail__pills">
                {recentChords.map((c, i) => (
                  <ChordPill
                    key={i}
                    chord={c}
                    size="md"
                    active={i === recentChords.length - 1}
                    notation={notation}
                    onClick={() => handlePaletteTap(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {recentChords.length > 0 && (
            <div className="transcribe-rail__section">
              <div className="transcribe-rail__label">Recent · tap to add</div>
              <div className="transcribe-rail__pills">
                {recentChords.map((c, i) => (
                  <ChordPill
                    key={i}
                    chord={c}
                    size="sm"
                    notation={notation}
                    onClick={() => handlePaletteTap(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {recentChords.length === 0 && (
            <div className="transcribe-rail__empty">
              Play chords to build the palette…
            </div>
          )}

          <div className="transcribe-rail__hints">
            <div>· play MIDI → fills armed slot</div>
            <div>· tap slot → arm / replace</div>
            <div>· tap × → delete chord</div>
            <div>· backspace → clear slot</div>
          </div>
        </div>
      </div>

      {/* Armed coach mark */}
      <div className="transcribe-hint" aria-live="polite">
        {chordResult.chord
          ? `Detected: ${chordResult.chord} — hold to commit`
          : armed
          ? 'Play a chord or tap a pill to fill the armed slot'
          : 'All slots filled'}
      </div>
    </div>
  );
}
