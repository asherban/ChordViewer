import type { ChordDefinition } from './chord-definition.js';
import { chordSymbol, parseChordDefinition, validateChordDefinition } from './chord-definition.js';
import { measureTicks, type ChordEvent, type LeadSheet } from './score.js';
import { parseScore } from './validation.js';
import type { ChordPosition } from './chord-entry.js';

export interface LogicalChord { event: ChordEvent; ids: string[]; fragments: ChordEvent[]; start: number; ticks: number; position: ChordPosition }
export function logicalChords(score: LeadSheet): LogicalChord[] {
  const bar = measureTicks(score), groups = new Map<string, LogicalChord>();
  score.measures.forEach((m, i) => m.chords.forEach(e => {
    const key = e.logicalId ?? e.id, existing = groups.get(key);
    if (existing) { existing.ids.push(e.id); existing.fragments.push(e); existing.ticks += e.durationTicks; }
    else groups.set(key, { event: e, ids: [e.id], fragments: [e], start: i * bar + e.offsetTicks, ticks: e.durationTicks, position: { measureIndex: i, offsetTicks: e.offsetTicks } });
  }));
  return [...groups.values()].sort((a,b) => a.start-b.start);
}
export function chordGroup(score: LeadSheet, id: string): LogicalChord | null { return logicalChords(score).find(c => c.ids.includes(id)) ?? null; }
export function nextChordPosition(score: LeadSheet): ChordPosition {
  const bar = measureTicks(score), end = Math.max(0, ...logicalChords(score).map(c => c.start + c.ticks));
  return { measureIndex: Math.floor(end / bar), offsetTicks: end % bar };
}
export function chordDurationChoices(score: LeadSheet, current?: number): number[] {
  const bar = measureTicks(score), unit = 1920 / score.timeSignature.denominator;
  return [...new Set([...Array.from({ length: score.timeSignature.numerator }, (_, i) => (i + 1) * unit), ...(current ? [current] : []), bar])].sort((a,b) => a-b);
}
export function chordDurationLabel(score: LeadSheet, ticks: number): string {
  if (ticks === measureTicks(score)) return 'Whole bar';
  const denominator = score.timeSignature.denominator, beats = ticks / (1920 / denominator);
  return `${beats} ${denominator === 4 ? 'beat' : denominator === 8 ? 'eighth note' : 'half note'}${beats === 1 ? '' : 's'}`;
}
type Item = LogicalChord & { start: number; ticks: number };
function rebuild(score: LeadSheet, items: Item[], factory: () => string): LeadSheet {
  const bar = measureTicks(score), end = Math.max(0, ...items.map(c => c.start + c.ticks));
  if (end > bar * 256) throw new Error('This sheet has reached the 256-bar limit.');
  const used = new Set([score.id, ...score.measures.flatMap(m => [m.id, ...m.chords.map(e => e.id), ...m.melody.map(e => e.id)])]);
  const id = () => { const value = factory(); if (!/^[A-Za-z0-9_-]{1,64}$/.test(value) || used.has(value)) throw new Error('A new event or bar must have a unique valid ID.'); used.add(value); return value; };
  const measures = Array.from({ length: Math.max(score.measures.length, Math.ceil(end / bar), 1) }, (_, i) => ({ ...(score.measures[i] ?? { id: id(), melody: [] }), chords: [] as ChordEvent[] }));
  for (const item of items.sort((a,b) => a.start-b.start)) {
    if (!Number.isSafeInteger(item.ticks) || item.ticks <= 0 || item.start < 0) throw new Error('Choose a positive exact duration.');
    let fragment = 0;
    for (let at = item.start; at < item.start + item.ticks;) {
      const until = Math.min(item.start + item.ticks, (Math.floor(at / bar) + 1) * bar);
      const old = item.fragments[fragment];
      measures[Math.floor(at / bar)]!.chords.push({ ...item.event, id: fragment === 0 ? item.event.id : old?.id ?? id(), logicalId: item.event.id, offsetTicks: at % bar, durationTicks: until - at });
      at = until; fragment++;
    }
  }
  while (measures.length > 1 && !measures.at(-1)!.chords.length && !measures.at(-1)!.melody.length) measures.pop();
  return parseScore({ ...score, schemaVersion: 3, measures });
}
/** Symbol and duration are atomic; later chords shift by the exact delta, keeping gaps. */
export function changeChordAndShift(score: LeadSheet, eventId: string, symbol: string, ticks: number, factory: () => string, definition?: ChordDefinition) {
  parseScore(score);
  const selected = chordGroup(score, eventId);
  if (!selected) throw new Error('This chord no longer exists.');
  const parsed = parseChordDefinition(symbol);
  const d = definition ?? (symbol === selected.event.symbol ? selected.event.definition : parsed && chordSymbol(parsed) === symbol ? parsed : undefined);
  if (symbol !== selected.event.symbol || d !== selected.event.definition) validateSymbol(symbol, d);
  const delta = ticks - selected.ticks;
  const items = logicalChords(score);
  const changed = items.map(c => c.event.id === selected.event.id
    ? { ...c, ticks, event: { ...c.event, symbol, ...(d ? { definition: d } : { definition: undefined }) } }
    : { ...c, start: c.start > selected.start ? c.start + delta : c.start });
  return { score: rebuild(score, changed, factory), eventId: selected.event.id, position: selected.position };
}
function validateSymbol(symbol: string, definition?: ChordDefinition) {
  if (typeof symbol !== 'string' || !symbol.length || symbol.trim() !== symbol || [...symbol].length > 512 || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(symbol)) throw new Error('Choose a printable chord of at most 512 characters.');
  if (definition) { validateChordDefinition(definition); if (chordSymbol(definition) !== symbol) throw new Error('Chord preview does not match its definition.'); }
  else if (!parseChordDefinition(symbol)) throw new Error('Choose a supported chord symbol or construct the chord with the tone controls.');
}
export function appendChord(score: LeadSheet, symbol: string, ticks: number, factory: () => string, definition?: ChordDefinition) {
  parseScore(score); const parsed = parseChordDefinition(symbol); const d = definition ?? (parsed && chordSymbol(parsed) === symbol ? parsed : undefined); validateSymbol(symbol, d);
  const position = nextChordPosition(score), bar = measureTicks(score), eventId = factory();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(eventId) || [score.id, ...score.measures.flatMap(m => [m.id, ...m.chords.map(e => e.id), ...m.melody.map(e => e.id)])].includes(eventId)) throw new Error('A new chord must have a unique valid ID.');
  const event: ChordEvent = { id: eventId, offsetTicks: position.offsetTicks, durationTicks: ticks, symbol, ...(d ? { definition: d } : {}) };
  const item: LogicalChord = { event, fragments: [event], ids: [eventId], start: position.measureIndex * bar + position.offsetTicks, ticks, position };
  const result = rebuild(score, [...logicalChords(score), item], factory);
  return { score: result, eventId, position: nextChordPosition(result) };
}
export function deleteChordAndShift(score: LeadSheet, eventId: string, factory: () => string): LeadSheet {
  parseScore(score); const selected = chordGroup(score, eventId); if (!selected) throw new Error('This chord no longer exists.');
  return rebuild(score, logicalChords(score).filter(c => c.event.id !== selected.event.id).map(c => ({ ...c, start: c.start > selected.start ? c.start - selected.ticks : c.start })), factory);
}

/** Compatibility for the web's score-position gestures: split logical spans explicitly. */
export function overwriteChord(score: LeadSheet, position: ChordPosition, symbol: string, ticks: number, factory: () => string, replaceId?: string) {
  parseScore(score);
  const bar = measureTicks(score), start = position.measureIndex * bar + position.offsetTicks, end = start + ticks;
  if (!Number.isInteger(position.measureIndex) || position.measureIndex < 0 || position.measureIndex > score.measures.length || !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= bar) throw new Error('Choose a position inside the score.');
  const original = replaceId ? chordGroup(score, replaceId) : null;
  if (replaceId && !original) throw new Error('This chord no longer exists.');
  if (original && original.start === start) return changeChordAndShift(score, replaceId!, symbol, ticks, factory);
  const parsed = parseChordDefinition(symbol), definition = original?.event.symbol === symbol ? original.event.definition : parsed && chordSymbol(parsed) === symbol ? parsed : undefined;
  validateSymbol(symbol, definition);
  const eventId = original?.event.id ?? factory();
  const event: ChordEvent = { id: eventId, offsetTicks: position.offsetTicks, durationTicks: ticks, symbol, ...(definition ? { definition } : {}) };
  const items = logicalChords(score).filter(c => c.event.id !== original?.event.id).flatMap(c => {
    if (c.start >= end || c.start + c.ticks <= start) return [c];
    const left = c.start < start ? [{ ...c, ticks: start - c.start }] : [];
    const right = c.start + c.ticks > end ? [{ ...c, start: end, ticks: c.start + c.ticks - end, event: left.length ? { ...c.event, id: factory() } : c.event, fragments: [] }] : [];
    return [...left, ...right];
  });
  const item: LogicalChord = { event, ids: [eventId], fragments: original?.fragments ?? [event], start, ticks, position };
  const result = rebuild(score, [...items, item], factory);
  return { score: result, eventId, position: { measureIndex: Math.floor(end / bar), offsetTicks: end % bar } };
}
