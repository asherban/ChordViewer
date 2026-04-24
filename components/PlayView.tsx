'use client'

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

function firstNonNull(seq: SlotEntry[]): number {
  return seq.findIndex((e) => e.chord !== null);
}

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

  const [cursor, setCursor] = useState(() => Math.max(0, firstNonNull(seq)));
  const [autoPlaying, setAutoPlaying] = useState(false);

  const wasMatchingRef = useRef(false);

  useEffect(() => {
    const expected = seq[cursor]?.chord ?? null;
    const detected = chordResult.chord;
    const isMatching = matchesExpected(expected, detected);

    if (isMatching && !wasMatchingRef.current) {
      setCursor((prev) => {
        let next = prev + 1;
        while (next < seq.length && seq[next].chord === null) next++;
        return next < seq.length ? next : prev;
      });
    }
    wasMatchingRef.current = isMatching;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordResult.chord, cursor]);

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

      <div className="play-chart">
        <div className="play-lines">
          {lines.map((line, li) => {
            const dist = Math.abs(li - curLineIdx);
            if (dist > 2) return null;
            const isCurrent = li === curLineIdx;

            const lineBars: (string | null)[][] = [];
            for (let i = 0; i < line.slots.length; i += 4) {
              lineBars.push(line.slots.slice(i, i + 4).map((e) => e.chord));
            }
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

        <div className="play-fade play-fade--top" />
        <div className="play-fade play-fade--bottom" />
      </div>

      <div className="play-footer">
        <span>PLAY WITH ME</span>
        <span>·</span>
        <span>{cursor + 1} / {seq.length}</span>
      </div>
    </div>
  );
}
