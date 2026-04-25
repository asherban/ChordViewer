'use client'

import React, { useEffect, useRef, useState } from 'react';
import { Bar } from './Bar';
import { ChordPill } from './ChordPill';
import { JazzChord } from './JazzChord';
import type { ChordResult } from '../lib/chordDetect';
import type { Notation } from '../lib/notation';
import type { ChordHistoryEntry } from '../lib/useChordHistory';
import type { LeadSheet } from '../lib/leadSheet';

interface Armed {
  bar: number;
  slot: number;
}

interface SlotCoord {
  bar: number;
  slot: number;
}

interface DragTracking {
  source: SlotCoord;
  chord: string;
  startX: number;
  startY: number;
  pointerId: number;
  started: boolean;
}

interface DragUI {
  source: SlotCoord;
  chord: string;
  ghostX: number;
  ghostY: number;
  target: SlotCoord | null;
}

const DRAG_THRESHOLD_PX = 6;

interface Props {
  chart: LeadSheet;
  onChartChange: (chart: LeadSheet) => void;
  onClearChart: () => void;
  chordResult: ChordResult;
  chordHistory: ChordHistoryEntry[];
  notation: Notation;
  midiDeviceName: string | null;
  midiConnected: boolean;
  hasVideo?: boolean;
  paletteTapRef?: React.MutableRefObject<((chord: string) => void) | null>;
}

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
  hasVideo = false,
  paletteTapRef,
}: Props) {
  const { meta, bars } = chart;

  const [armed, setArmed] = useState<Armed>({ bar: 0, slot: 0 });
  const armedRef = useRef(armed);
  useEffect(() => { armedRef.current = armed; }, [armed]);

  const chartRef = useRef(chart);
  useEffect(() => { chartRef.current = chart; }, [chart]);

  const commitTimerRef = useRef<number | null>(null);
  const pendingChordRef = useRef<string | null>(null);
  const waitingForReleaseRef = useRef(false);

  function fillAndAdvance(chord: string, armed: Armed, bars: (string | null)[][], advanceWhole: boolean) {
    const next = bars.map((b) => b.slice());
    next[armed.bar][armed.slot] = chord;

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

  useEffect(() => {
    const chord = chordResult.chord;

    if (!chord) {
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

    pendingChordRef.current = chord;
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);

    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      const c = pendingChordRef.current;
      if (!c || c !== chord) return;

      waitingForReleaseRef.current = true;

      const currentArmed = armedRef.current;
      const currentChart = chartRef.current;
      const nextBars = currentChart.bars.map((b) => b.slice());
      nextBars[currentArmed.bar][currentArmed.slot] = c;

      const nextBar = currentArmed.bar + 1;
      if (nextBar >= nextBars.length) {
        nextBars.push([null, null, null, null]);
      }

      onChartChange({ ...currentChart, bars: nextBars });
      setArmed({ bar: nextBar, slot: 0 });
    }, 450);

    return () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordResult.chord]);

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

  const dragRef = useRef<DragTracking | null>(null);
  const [dragUI, setDragUI] = useState<DragUI | null>(null);

  function handleChordMove(from: SlotCoord, to: SlotCoord) {
    if (from.bar === to.bar && from.slot === to.slot) return;
    const currentBars = chartRef.current.bars;
    const next = currentBars.map((b) => b.slice());
    const chord = next[from.bar]?.[from.slot];
    if (!chord) return;

    next[from.bar][from.slot] = null;

    if (!next[to.bar]?.[to.slot]) {
      next[to.bar][to.slot] = chord;
      onChartChange({ ...chartRef.current, bars: next });
      setArmed({ bar: to.bar, slot: to.slot });
      return;
    }

    let carry: string | null = chord;
    let b = to.bar;
    let s = to.slot;
    while (carry) {
      if (b >= next.length) {
        next.push([null, null, null, null]);
      }
      const displaced = next[b][s];
      next[b][s] = carry;
      carry = displaced;
      s += 1;
      if (s >= next[b].length) {
        b += 1;
        s = 0;
      }
    }

    onChartChange({ ...chartRef.current, bars: next });
    setArmed({ bar: to.bar, slot: to.slot });
  }

  function findSlotAtPoint(x: number, y: number): SlotCoord | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slotEl = (el as Element).closest('[data-bar][data-slot]') as HTMLElement | null;
    if (!slotEl) return null;
    const bar = Number(slotEl.dataset.bar);
    const slot = Number(slotEl.dataset.slot);
    if (Number.isNaN(bar) || Number.isNaN(slot)) return null;
    return { bar, slot };
  }

  function handleSlotPointerDown(barIdx: number, slotIdx: number, e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const chord = chartRef.current.bars[barIdx]?.[slotIdx];
    if (!chord) return;
    dragRef.current = {
      source: { bar: barIdx, slot: slotIdx },
      chord,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      started: false,
    };
  }

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (!d.started) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        d.started = true;
      }
      e.preventDefault();
      const target = findSlotAtPoint(e.clientX, e.clientY);
      setDragUI({
        source: d.source,
        chord: d.chord,
        ghostX: e.clientX,
        ghostY: e.clientY,
        target,
      });
    }

    function onPointerUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const started = d.started;
      const source = d.source;
      dragRef.current = null;
      if (!started) {
        setDragUI(null);
        return;
      }
      const target = findSlotAtPoint(e.clientX, e.clientY);
      setDragUI(null);
      if (target) {
        handleChordMove(source, target);
      }
    }

    function onPointerCancel(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDragUI(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && dragRef.current) {
        dragRef.current = null;
        setDragUI(null);
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePaletteTap(chord: string) {
    fillAndAdvance(chord, armed, bars, false);
  }

  if (paletteTapRef) paletteTapRef.current = handlePaletteTap;

  function updateMeta(key: keyof typeof meta, value: string) {
    onChartChange({ ...chart, meta: { ...meta, [key]: value } });
  }

  const recentChords = chordHistory.map((e) => e.chord);

  return (
    <div className="transcribe-view">
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
                onSlotPointerDown={handleSlotPointerDown}
                dragSourceSlot={dragUI && dragUI.source.bar === barIdx ? dragUI.source.slot : undefined}
                dropTargetSlot={dragUI?.target && dragUI.target.bar === barIdx ? dragUI.target.slot : undefined}
                fontSize={30}
                minHeight={100}
              />
            ))}
          </div>

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

        {!hasVideo && <div className="transcribe-rail">
          {!hasVideo && recentChords.length > 0 && (
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

          {!hasVideo && recentChords.length > 0 && (
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

          {!hasVideo && recentChords.length === 0 && (
            <div className="transcribe-rail__empty">
              Play chords to build the palette…
            </div>
          )}
        </div>}
      </div>

      <div className="transcribe-hint" aria-live="polite">
        {dragUI
          ? 'Drop on a slot to move — dropping on a filled slot pushes right'
          : chordResult.chord
          ? `Detected: ${chordResult.chord} — hold to commit`
          : armed
          ? 'Play a chord, tap a pill, or drag a chord to move it'
          : 'All slots filled'}
      </div>

      {dragUI && (
        <div
          className="chord-drag-ghost"
          style={{ left: dragUI.ghostX, top: dragUI.ghostY }}
        >
          <JazzChord chord={dragUI.chord} fontSize={30} notation={notation} />
        </div>
      )}
    </div>
  );
}
