import { useEffect, useRef, useState } from 'react';
import { Bar } from './Bar';
import { matchesExpected } from '../lib/chordMatch';
import type { ChordResult } from '../lib/chordDetect';
import type { Notation } from '../lib/notation';
import type { LeadSheet } from '../lib/leadSheet';

const BARS_PER_LINE = 4;
const SLOTS_PER_LINE = BARS_PER_LINE * 4;

interface Props {
  chart: LeadSheet;
  chordResult: ChordResult;
  notation: Notation;
  midiConnected: boolean;
}

// Flatten bars into a sequence of {chord, barIdx, slotIdx}
interface SlotEntry {
  chord: string | null;
  barIdx: number;
  slotIdx: number;
}

function flattenBars(bars: (string | null)[][]): SlotEntry[] {
  const seq: SlotEntry[] = [];
  for (let b = 0; b < bars.length; b++) {
    for (let s = 0; s < bars[b].length; s++) {
      seq.push({ chord: bars[b][s], barIdx: b, slotIdx: s });
    }
  }
  return seq;
}

// Find first non-null slot index
function firstNonNull(seq: SlotEntry[]): number {
  return seq.findIndex((e) => e.chord !== null);
}

// Group flat seq into lines of SLOTS_PER_LINE
interface LineEntry {
  startAbsIdx: number;
  slots: SlotEntry[];
}

function groupIntoLines(seq: SlotEntry[]): LineEntry[] {
  const lines: LineEntry[] = [];
  for (let i = 0; i < seq.length; i += SLOTS_PER_LINE) {
    lines.push({ startAbsIdx: i, slots: seq.slice(i, i + SLOTS_PER_LINE) });
  }
  return lines;
}

export function PlayView({ chart, chordResult, notation, midiConnected }: Props) {
  const { meta, bars } = chart;
  const seq = flattenBars(bars);
  const lines = groupIntoLines(seq);

  const hasChords = seq.some((e) => e.chord !== null);

  // cursor = absolute slot index of the next-to-play chord
  const [cursor, setCursor] = useState(() => Math.max(0, firstNonNull(seq)));
  const [autoPlaying, setAutoPlaying] = useState(false);

  // Track whether the detector was previously matching to detect transitions
  const wasMatchingRef = useRef(false);

  // Real-time match: advance on false→true transition
  useEffect(() => {
    const expected = seq[cursor]?.chord ?? null;
    const detected = chordResult.chord;
    const isMatching = matchesExpected(expected, detected);

    if (isMatching && !wasMatchingRef.current) {
      // Advance to next non-null slot
      setCursor((prev) => {
        let next = prev + 1;
        while (next < seq.length && seq[next].chord === null) next++;
        return next < seq.length ? next : prev;
      });
    }
    wasMatchingRef.current = isMatching;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordResult.chord, cursor]);

  // Auto-advance demo mode
  useEffect(() => {
    if (!autoPlaying) return;
    const t = setInterval(() => {
      setCursor((prev) => {
        let next = prev + 1;
        while (next < seq.length && seq[next].chord === null) next++;
        return next < seq.length ? next : prev;
      });
    }, 1600);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlaying]);

  // Reset cursor when chart changes
  useEffect(() => {
    setCursor(Math.max(0, firstNonNull(seq)));
    wasMatchingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  function restart() {
    setCursor(Math.max(0, firstNonNull(seq)));
    wasMatchingRef.current = false;
  }

  const curLineIdx = Math.floor(cursor / SLOTS_PER_LINE);

  if (!hasChords) {
    return (
      <div className="play-view play-view--empty">
        <div className="play-view__empty-msg">
          <p>No chart to play.</p>
          <p>Switch to <strong>Transcribe</strong> to build a lead sheet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="play-view">
      {/* Header */}
      <div className="play-header">
        <div className="play-header__left">
          <span className="play-header__title">{meta.title || 'Untitled'}</span>
          <span className="play-header__meta">
            {[meta.key, meta.time, meta.tempo ? `♩ = ${meta.tempo}` : ''].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="play-header__right">
          <div className="play-header__midi">
            <span className={`play-header__dot ${midiConnected ? 'play-header__dot--on' : ''}`} />
            listening
          </div>
          <button
            className={`play-header__btn${autoPlaying ? ' play-header__btn--active' : ''}`}
            onClick={() => setAutoPlaying((p) => !p)}
          >
            {autoPlaying ? '⏸ pause' : '▶ auto-advance'}
          </button>
          <button className="play-header__btn" onClick={restart}>
            ⏮ restart
          </button>
        </div>
      </div>

      {/* Rolling chart area */}
      <div className="play-chart">
        <div className="play-lines">
          {lines.map((line, li) => {
            const dist = Math.abs(li - curLineIdx);
            if (dist > 2) return null;
            const isCurrent = li === curLineIdx;

            // Build bars-per-line from the line's slots
            const lineBars: (string | null)[][] = [];
            for (let i = 0; i < line.slots.length; i += 4) {
              lineBars.push(line.slots.slice(i, i + 4).map((e) => e.chord));
            }
            // Pad to BARS_PER_LINE bars
            while (lineBars.length < BARS_PER_LINE) lineBars.push([null, null, null, null]);

            const pastSet = new Set<number>();
            for (let i = line.startAbsIdx; i < cursor && i < line.startAbsIdx + SLOTS_PER_LINE; i++) {
              pastSet.add(i);
            }

            const lineBarStartIdx = line.startAbsIdx / 4;

            return (
              <div
                key={li}
                className={`play-line${isCurrent ? ' play-line--current' : ''}`}
                style={{ opacity: isCurrent ? 1 : dist === 1 ? 0.45 : 0.2 }}
              >
                {lineBars.map((barSlots, bi) => {
                  const barIdx = lineBarStartIdx + bi;
                  const barAbsStart = line.startAbsIdx + bi * 4;
                  return (
                    <Bar
                      key={bi}
                      bar={barSlots}
                      barIdx={barIdx}
                      notation={notation}
                      playingSlot={cursor}
                      pastSlots={pastSet}
                      baseAbsIdx={barAbsStart}
                      isCurrentLine={isCurrent}
                      fontSize={isCurrent ? 32 : 18}
                      minHeight={isCurrent ? 110 : 60}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Fade masks */}
        <div className="play-fade play-fade--top" />
        <div className="play-fade play-fade--bottom" />
      </div>

      {/* Footer */}
      <div className="play-footer">
        <span>PLAY WITH ME</span>
        <span>·</span>
        <span>{cursor + 1} / {seq.length}</span>
      </div>
    </div>
  );
}
