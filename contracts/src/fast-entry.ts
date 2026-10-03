import { durationTicks, measureTicks, sameSpelledPitch, type ChordEvent, type LeadSheet, type MelodyEvent, type NoteDuration } from './score.js';
import { parseScore } from './validation.js';
import { removeInvalidMelodyTies } from './music.js';
import { MELODY_DURATIONS, type MelodySpec } from './melody-entry.js';
import type { ChordPosition } from './chord-entry.js';

/** Keep interior silence, but end the sheet at its last pitched note or chord.
 * An active rest entry or an explicitly added bar may temporarily reserve more space.
 */
export function trimTrailingSilentBars(score: LeadSheet, minimumBars = 1): LeadSheet {
  let count = score.measures.length;
  while (count > Math.max(1, minimumBars)) {
    const bar = score.measures[count - 1]!;
    if (bar.chords.length > 0 || bar.melody.some(e => e.kind === 'note')) break;
    count--;
  }
  return count >= score.measures.length ? score : { ...score, measures: score.measures.slice(0, count) };
}

/** Exact decomposition: an unsupported remainder must never be rounded away. */
export function splitDuration(ticks: number): NoteDuration[] {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 11520 || ticks % 60) throw new Error('This edit leaves a rhythm the score cannot represent. Choose another beat or duration.');
  const values = [...MELODY_DURATIONS].sort((a, b) => durationTicks(b) - durationTicks(a));
  const parts: (NoteDuration[] | undefined)[] = Array(ticks / 60 + 1);
  parts[0] = [];
  for (let i = 1; i < parts.length; i++) for (const duration of values) {
    const before = parts[i - durationTicks(duration) / 60];
    if (before && (!parts[i] || before.length + 1 < parts[i]!.length)) parts[i] = [duration, ...before];
  }
  const result = parts[ticks / 60];
  if (!result) throw new Error('This edit leaves a rhythm the score cannot represent. Choose another beat or duration.');
  return result;
}

function allocator(score: LeadSheet, factory: () => string) {
  const used = new Set([score.id, ...score.measures.flatMap(m => [m.id, ...m.chords.map(e => e.id), ...m.melody.map(e => e.id)])]);
  return () => {
    const id = factory();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || used.has(id)) throw new Error('A new event or bar must have a unique valid ID.');
    used.add(id); return id;
  };
}

function range(score: LeadSheet, position: ChordPosition, ticks: number) {
  parseScore(score);
  const bar = measureTicks(score);
  if (!Number.isInteger(position.measureIndex) || position.measureIndex < 0 || position.measureIndex > score.measures.length ||
      !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= bar || !Number.isInteger(ticks) || ticks <= 0 || ticks > 11520) throw new Error('Choose a valid position and duration.');
  const start = position.measureIndex * bar + position.offsetTicks, end = start + ticks;
  if (Math.ceil(end / bar) > 256) throw new Error('This sheet has reached the 256-bar limit.');
  return { bar, start, end, position: { measureIndex: Math.floor(end / bar), offsetTicks: end % bar } };
}

/** Writes exactly the requested span, retaining both tails of overlapped chords. */
export function writeChord(score: LeadSheet, position: ChordPosition, symbol: string, ticks: number, factory: () => string, replaceId?: string) {
  const r = range(score, position, ticks), id = allocator(score, factory);
  if (typeof symbol !== 'string' || !symbol.length || symbol.trim() !== symbol || [...symbol].length > 32 || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(symbol)) throw new Error('Enter a printable chord symbol of 1 to 32 characters.');
  if (replaceId && !score.measures.some(m => m.chords.some(e => e.id === replaceId))) throw new Error('This chord no longer exists.');
  const eventId = replaceId ?? id();
  const measures = Array.from({ length: Math.max(score.measures.length, Math.ceil(r.end / r.bar)) }, (_, index) => {
    const old = score.measures[index] ?? { id: id(), chords: [], melody: [] };
    const start = Math.max(0, r.start - index * r.bar), end = Math.min(r.bar, r.end - index * r.bar);
    let chords: ChordEvent[] = old.chords.filter(e => e.id !== replaceId);
    if (start < end) {
      chords = chords.flatMap(e => {
        const right = e.offsetTicks + e.durationTicks;
        if (right <= start || e.offsetTicks >= end) return [e];
        const left = e.offsetTicks < start ? [{ ...e, durationTicks: start - e.offsetTicks }] : [];
        return [...left, ...(right > end ? [{ ...e, id: left.length ? id() : e.id, offsetTicks: end, durationTicks: right - end }] : [])];
      });
      chords.push({ id: index === position.measureIndex ? eventId : id(), offsetTicks: start, durationTicks: end - start, symbol });
    }
    return { ...old, chords: chords.sort((a, b) => a.offsetTicks - b.offsetTicks) };
  });
  return { score: parseScore({ ...score, measures }), position: r.position, eventId };
}

function melodyParts(event: MelodyEvent, start: number, end: number, firstId: string, id: () => string, tieAfter: boolean): MelodyEvent[] {
  const durations = splitDuration(end - start);
  let offsetTicks = start;
  return durations.map((duration, index) => {
    const base = { id: index ? id() : firstId, offsetTicks, duration };
    offsetTicks += durationTicks(duration);
    return event.kind === 'rest' ? { ...base, kind: 'rest' } : { ...base, kind: 'note', pitch: event.pitch,
      ...(index < durations.length - 1 || tieAfter ? { tieToNext: true } : {}) };
  });
}

/** Splits at barlines and ties note fragments. The entire edit either validates or fails. */
export function writeMelody(score: LeadSheet, position: ChordPosition, spec: MelodySpec, factory: () => string, replaceId?: string) {
  if (!MELODY_DURATIONS.some(d => d.denominator === spec.duration.denominator && d.dots === spec.duration.dots)) throw new Error('Choose a supported note duration.');
  const r = range(score, position, durationTicks(spec.duration)), id = allocator(score, factory);
  const original = score.measures.flatMap(m => m.melody).find(e => e.id === replaceId);
  if (replaceId && !original) throw new Error('This note or rest no longer exists.');
  const eventId = replaceId ?? id();
  const event: MelodyEvent = { ...spec, id: eventId, offsetTicks: 0 };
  const measures = Array.from({ length: Math.max(score.measures.length, Math.ceil(r.end / r.bar)) }, (_, index) => {
    const old = score.measures[index] ?? { id: id(), chords: [], melody: [] };
    const start = Math.max(0, r.start - index * r.bar), end = Math.min(r.bar, r.end - index * r.bar);
    let melody = old.melody.filter(e => e.id !== replaceId);
    if (start < end) {
      melody = melody.flatMap(e => {
        const right = e.offsetTicks + durationTicks(e.duration);
        if (right <= start || e.offsetTicks >= end) return [e];
        const left = e.offsetTicks < start ? melodyParts(e, e.offsetTicks, start, e.id, id, false) : [];
        return [...left, ...(right > end ? melodyParts(e, end, right, left.length ? id() : e.id, id, e.kind === 'note' && !!e.tieToNext) : [])];
      });
      const tieAfter = (index + 1) * r.bar < r.end || (original?.kind === 'note' && !!original.tieToNext);
      melody.push(...melodyParts(event, start, end, index === position.measureIndex ? eventId : id(), id, tieAfter));
    }
    return { ...old, melody: melody.sort((a, b) => a.offsetTicks - b.offsetTicks) };
  });
  return { score: parseScore(removeInvalidMelodyTies({ ...score, measures })), position: r.position, eventId };
}

export function insertBar(score: LeadSheet, index: number, factory: () => string): LeadSheet {
  parseScore(score);
  if (!Number.isInteger(index) || index < 0 || index > score.measures.length) throw new Error('Choose an existing bar or the end of the sheet.');
  if (score.measures.length >= 256) throw new Error('This sheet has reached the 256-bar limit.');
  const measures = [...score.measures];
  measures.splice(index, 0, { id: allocator(score, factory)(), chords: [], melody: [] });
  return parseScore(removeInvalidMelodyTies({ ...score, measures }));
}

/** The entry cursor follows the last written note or rest, regardless of selection. */
export function nextMelodyPosition(score: LeadSheet): ChordPosition {
  const bar = measureTicks(score);
  const end = Math.max(0, ...score.measures.flatMap((m, i) => m.melody.map(e => i * bar + e.offsetTicks + durationTicks(e.duration))));
  return { measureIndex: Math.floor(end / bar), offsetTicks: end % bar };
}

/** A tied chain is one sounding note, whichever fragment was selected. */
export function melodyGroup(score: LeadSheet, eventId: string) {
  const bar = measureTicks(score);
  const events = score.measures.flatMap((m, i) => m.melody.map(event => ({ event, start: i * bar + event.offsetTicks })));
  let first = events.findIndex(e => e.event.id === eventId);
  if (first < 0) return null;
  const linked = (index: number) => {
    const a = events[index], b = events[index + 1];
    return a?.event.kind === 'note' && a.event.tieToNext && b?.event.kind === 'note' &&
      sameSpelledPitch(a.event.pitch, b.event.pitch) && a.start + durationTicks(a.event.duration) === b.start;
  };
  while (first > 0 && linked(first - 1)) first--;
  let last = first;
  while (linked(last)) last++;
  const selected = events.slice(first, last + 1), start = selected[0]!.start;
  return { event: selected[0]!.event, ids: selected.map(e => e.event.id), start,
    ticks: selected.reduce((sum, e) => sum + durationTicks(e.event.duration), 0),
    position: { measureIndex: Math.floor(start / bar), offsetTicks: start % bar } };
}

/** Resize a whole tied note and shift later melody. Chords and existing gaps stay fixed in length. */
export function changeMelodyAndShift(score: LeadSheet, eventId: string, spec: MelodySpec, factory: () => string, ticks = durationTicks(spec.duration)) {
  return rewriteMelody(score, eventId, spec, ticks, factory);
}

/** Remove a whole note/rest and close its span. */
export function deleteMelodyAndShift(score: LeadSheet, eventId: string, factory: () => string): LeadSheet {
  return rewriteMelody(score, eventId, null, 0, factory).score;
}

function rewriteMelody(score: LeadSheet, eventId: string, spec: MelodySpec | null, ticks: number, factory: () => string) {
  parseScore(score);
  if (spec && !MELODY_DURATIONS.some(d => d.denominator === spec.duration.denominator && d.dots === spec.duration.dots)) throw new Error('Choose a supported note duration.');
  if (!Number.isInteger(ticks) || ticks < 0 || (spec !== null && ticks === 0)) throw new Error('Choose a supported note duration.');
  const bar = measureTicks(score), id = allocator(score, factory);
  const events = score.measures.flatMap((m, i) => m.melody.map(event => ({ event, start: i * bar + event.offsetTicks })));
  const selected = melodyGroup(score, eventId);
  if (!selected) throw new Error('This note or rest no longer exists.');
  const delta = ticks - selected.ticks;
  const shifted = events.filter(e => !selected.ids.includes(e.event.id)).map(({ event, start }) => ({ event,
    start: start > selected.start ? start + delta : start, ticks: durationTicks(event.duration) }));
  if (spec) shifted.push({ event: { ...spec, id: selected.event.id, offsetTicks: selected.event.offsetTicks }, start: selected.start, ticks });
  shifted.sort((a, b) => a.start - b.start);
  const end = Math.max(0, ...shifted.map(e => e.start + e.ticks));
  if (Math.ceil(end / bar) > 256) throw new Error('This sheet has reached the 256-bar limit.');
  const measures = Array.from({ length: Math.max(score.measures.length, Math.ceil(end / bar)) }, (_, i) =>
    ({ ...(score.measures[i] ?? { id: id(), chords: [] }), melody: [] as MelodyEvent[] }));
  for (const { event, start, ticks } of shifted) {
    const end = start + ticks;
    for (let at = start; at < end;) {
      const index = Math.floor(at / bar), until = Math.min(end, (index + 1) * bar);
      measures[index]!.melody.push(...melodyParts(event, at % bar, until - index * bar, at === start ? event.id : id(), id,
        until < end || (event.kind === 'note' && !!event.tieToNext)));
      at = until;
    }
  }
  return { score: parseScore(removeInvalidMelodyTies({ ...score, measures })), eventId: selected.event.id,
    position: { measureIndex: Math.floor(selected.start / bar), offsetTicks: selected.start % bar } };
}
