'use client'

import React from 'react';
import { JazzChord } from './JazzChord';
import type { Notation } from '../lib/notation';

interface Props {
  bar: (string | null)[];
  barIdx: number;
  notation: Notation;
  armedSlot?: number;
  playingSlot?: number;
  pastSlots?: Set<number>;
  baseAbsIdx?: number;
  isCurrentLine?: boolean;
  onSlotClick?: (barIdx: number, slotIdx: number) => void;
  onDelete?: (barIdx: number, slotIdx: number) => void;
  onSlotPointerDown?: (barIdx: number, slotIdx: number, e: React.PointerEvent) => void;
  dragSourceSlot?: number;
  dropTargetSlot?: number;
  fontSize?: number;
  minHeight?: number;
}

export function Bar({
  bar,
  barIdx,
  notation,
  armedSlot,
  playingSlot,
  pastSlots,
  baseAbsIdx = 0,
  isCurrentLine = false,
  onSlotClick,
  onDelete,
  onSlotPointerDown,
  dragSourceSlot,
  dropTargetSlot,
  fontSize = 24,
  minHeight = 80,
}: Props) {
  return (
    <div
      className={`lead-bar${isCurrentLine ? ' lead-bar--current' : ''}`}
      style={{ minHeight }}
    >
      <span className="lead-bar__bar-number">{barIdx + 1}</span>
      {bar.map((chord, slotIdx) => {
        const absIdx = baseAbsIdx + slotIdx;
        const isArmed = armedSlot === slotIdx;
        const isPlaying = playingSlot !== undefined && playingSlot === absIdx;
        const isPast = pastSlots ? pastSlots.has(absIdx) : false;

        return (
          <div key={slotIdx} className="lead-bar__slot-wrapper">
            {slotIdx > 0 && <div className="lead-bar__divider" />}
            <div
              className={[
                'lead-bar__slot',
                isArmed ? 'lead-bar__slot--armed' : '',
                isPlaying ? 'lead-bar__slot--playing' : '',
                isPast ? 'lead-bar__slot--past' : '',
                chord ? 'lead-bar__slot--filled' : '',
                dragSourceSlot === slotIdx ? 'lead-bar__slot--drag-source' : '',
                dropTargetSlot === slotIdx ? 'lead-bar__slot--drag-over' : '',
              ].filter(Boolean).join(' ')}
              data-bar={barIdx}
              data-slot={slotIdx}
              onClick={() => onSlotClick?.(barIdx, slotIdx)}
              onPointerDown={chord && onSlotPointerDown ? (e) => onSlotPointerDown(barIdx, slotIdx, e) : undefined}
              onContextMenu={(e) => e.preventDefault()}
              role={onSlotClick ? 'button' : undefined}
              tabIndex={onSlotClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onSlotClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSlotClick(barIdx, slotIdx);
                }
              }}
            >
              {chord ? (
                <>
                  <JazzChord chord={chord} fontSize={fontSize} notation={notation} />
                  {onDelete && (
                    <button
                      className="lead-bar__delete"
                      onClick={(e) => { e.stopPropagation(); onDelete(barIdx, slotIdx); }}
                      onKeyDown={(e) => e.stopPropagation()}
                      tabIndex={-1}
                      aria-label="Delete chord"
                    >×</button>
                  )}
                  {isArmed && <span className="lead-bar__armed-dot" />}
                </>
              ) : (
                <span className="lead-bar__placeholder">
                  {isArmed ? <span className="lead-bar__armed-dot lead-bar__armed-dot--center" /> : '·'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
