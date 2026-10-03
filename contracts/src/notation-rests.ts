import { durationTicks, type Measure } from './score.js';
import { MELODY_DURATIONS } from './melody-entry.js';

/** Derived notation only: these rests do not move the entry cursor or change stored music. */
export function notationRests(measure: Measure, barTicks: number) {
  const choices = MELODY_DURATIONS.map(duration => ({ duration,
    ticks: 1920 / duration.denominator * (duration.dots ? 1.5 : 1) })).sort((a, b) => b.ticks - a.ticks);
  const result: { offsetTicks: number; ticks: number; duration: { denominator: number; dots: number } | null }[] = [];
  let cursor = 0;
  function gap(end: number) {
    while (cursor < end) {
      const choice = choices.find(c => c.ticks <= end - cursor);
      const ticks = choice?.ticks ?? end - cursor;
      result.push({ offsetTicks: cursor, ticks, duration: choice?.duration ?? null });
      cursor += ticks;
    }
  }
  for (const event of measure.melody) { gap(event.offsetTicks); cursor = event.offsetTicks + durationTicks(event.duration); }
  gap(barTicks);
  return result;
}
