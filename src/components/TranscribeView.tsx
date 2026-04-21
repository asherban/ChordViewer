import type React from 'react';
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

  // Always-current ref so the commit timer can read the latest chart without a stale closure
  const chartRef = useRef(chart);
  useEffect(() => { chartRef.current = chart; }, [chart]);

  // Drag-and-drop state (refs for event handlers, state for visual feedback)
  const dragInfoRef = useRef<{
    fromBar: number;
    fromSlot: number;
    chord: string;
    startX: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);
  const dragOverRef = useRef<{ bar: number; slot: number } | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    fromBar: number;
    fromSlot: number;
    overBar: number | null;
    overSlot: number | null;
  } | null>(null);

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

      // Set before setArmed so no new commit can sneak in while React schedules the update
      waitingForReleaseRef.current = true;

      setArmed((currentArmed) => {
        const currentChart = chartRef.current;
        const nextBars = currentChart.bars.map((b) => b.slice());
        nextBars[currentArmed.bar][currentArmed.slot] = c;

        const nextBar = currentArmed.bar + 1;
        if (nextBar >= nextBars.length) {
          nextBars.push([null, null, null, null]);
        }

        onChartChange({ ...currentChart, bars: nextBars });
        return { bar: nextBar, slot: 0 };
      });
    }, 450);

    return () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
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

  function handleSlotPointerDown(barIdx: number, slotIdx: number, chord: string, e: React.PointerEvent<HTMLDivElement>) {
    const startX = e.clientX;
    const startY = e.clientY;

    dragInfoRef.current = { fromBar: barIdx, fromSlot: slotIdx, chord, startX, startY, isDragging: false };
    dragOverRef.current = null;

    function onMove(me: PointerEvent) {
      const drag = dragInfoRef.current;
      if (!drag) return;

      if (!drag.isDragging && Math.hypot(me.clientX - startX, me.clientY - startY) > 6) {
        drag.isDragging = true;
        setDragVisual({ fromBar: barIdx, fromSlot: slotIdx, overBar: null, overSlot: null });
      }

      if (!drag.isDragging) return;
      me.preventDefault();

      // Find which bar slot is under the pointer
      const elements = document.elementsFromPoint(me.clientX, me.clientY);
      for (const el of elements) {
        const barStr = (el as HTMLElement).dataset?.barIdx;
        const slotStr = (el as HTMLElement).dataset?.slotIdx;
        if (barStr !== undefined && slotStr !== undefined) {
          const bar = parseInt(barStr);
          const slot = parseInt(slotStr);
          const prev = dragOverRef.current;
          if (!prev || prev.bar !== bar || prev.slot !== slot) {
            dragOverRef.current = { bar, slot };
            setDragVisual((v) => v ? { ...v, overBar: bar, overSlot: slot } : null);
          }
          return;
        }
      }
      if (dragOverRef.current) {
        dragOverRef.current = null;
        setDragVisual((v) => v ? { ...v, overBar: null, overSlot: null } : null);
      }
    }

    function onUp() {
      cleanup();
      const drag = dragInfoRef.current;
      const over = dragOverRef.current;
      dragInfoRef.current = null;
      dragOverRef.current = null;
      setDragVisual(null);

      if (!drag?.isDragging) return;

      // Suppress the click event that fires after pointerup so it doesn't arm the slot
      const suppressClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
      window.addEventListener('click', suppressClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', suppressClick, true), 300);

      if (!over || (over.bar === drag.fromBar && over.slot === drag.fromSlot)) return;

      const currentChart = chartRef.current;
      const next = currentChart.bars.map((b) => b.slice());
      // Swap: source gets target's existing chord (null if empty), target gets dragged chord
      next[drag.fromBar][drag.fromSlot] = next[over.bar][over.slot];
      next[over.bar][over.slot] = drag.chord;
      onChartChange({ ...currentChart, bars: next });
    }

    function cancel() {
      cleanup();
      dragInfoRef.current = null;
      dragOverRef.current = null;
      setDragVisual(null);
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
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
          <div className={`transcribe-bars${dragVisual ? ' transcribe-bars--dragging' : ''}`}>
            {bars.map((bar, barIdx) => (
              <Bar
                key={barIdx}
                bar={bar}
                barIdx={barIdx}
                notation={notation}
                armedSlot={armed.bar === barIdx ? armed.slot : undefined}
                onSlotClick={handleSlotClick}
                onDelete={handleDelete}
                onSlotPointerDown={handleSlotPointerDown}
                dragSourceSlot={dragVisual?.fromBar === barIdx ? dragVisual.fromSlot : undefined}
                dragOverSlot={dragVisual?.overBar === barIdx && dragVisual.overSlot !== null ? dragVisual.overSlot : undefined}
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
