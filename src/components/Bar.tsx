import { JazzChord } from './JazzChord';
import type { Notation } from '../lib/notation';

interface Props {
  bar: (string | null)[];
  barIdx: number;
  notation: Notation;
  armedSlot?: number;
  // For play view: which slot index is the next-to-play cursor
  playingSlot?: number;
  // For play view: which slots have already been played (absolute indices)
  pastSlots?: Set<number>;
  // Base absolute index for this bar's slots (used for past/playing tracking)
  baseAbsIdx?: number;
  isCurrentLine?: boolean;
  onSlotClick?: (barIdx: number, slotIdx: number) => void;
  onDelete?: (barIdx: number, slotIdx: number) => void;
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
  fontSize = 24,
  minHeight = 80,
}: Props) {
  return (
    <div
      className={`lead-bar${isCurrentLine ? ' lead-bar--current' : ''}`}
      style={{ minHeight }}
    >
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
              ].filter(Boolean).join(' ')}
              onClick={() => onSlotClick?.(barIdx, slotIdx)}
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
