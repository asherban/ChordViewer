import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { durationTicks, measureTicks, keyAccidentals, nextMelodyPosition, melodyGroup, notationRests, type Pitch, type ChordPosition, type LeadSheet, type MelodyEvent } from "@chordviewer/contracts";
import { Accidental, BarlineType, Dot, Formatter, Fraction, GhostNote, Renderer, Stave, StaveNote, StaveTie, TextNote, Voice, type Tickable } from "vexflow/bravura";
import { melodyAccidentals } from "./accidentals";
import { chordSegments, positionChordSegments, scoreSystems, scoreTickAtX, type Measure } from "./layout";
import { beatLabel, melodyLabel, meterLabel, settingsLabel } from "./labels";

export type ScoreEditing = {
  position: ChordPosition; selectedId: string | null; writable: boolean;
  lane: "chords" | "melody";
  selectChord: (id: string) => void; selectMelody: (id: string) => void; selectPosition: (position: ChordPosition) => void;
  moveChord?: (id: string, position: ChordPosition) => void; pause?: () => void;
  placeNote?: (position: ChordPosition, pitch: Pitch, id?: string) => void; enterRest?: () => void;
  setTie?: (enabled: boolean) => void; deleteNote?: () => void; durationControl?: ReactNode;
};
type ChordTarget = { id: string; symbol: string; offset: number; duration: number; bar: number; left: number; top: number; width: number };
type BarTarget = { index: number; left: number; top: number; width: number; height: number; bottom: number; points: { tick: number; x: number }[] };
type MelodyTarget = { id: string; label: string; left: number; top: number; width: number; height: number; x: number; y: number; bar: number; event: MelodyEvent };
type NotationLayout = { width: number; height: number; chords: ChordTarget[]; melody: MelodyTarget[]; bars: BarTarget[] };
const INK = "#18332f";
const STAFF = "#79867d";
const chordLabel = (chord: ChordTarget, score: LeadSheet) => `${chord.symbol}, bar ${chord.bar + 1}, beat ${beatLabel(chord.offset, score)}, ${chord.duration * score.timeSignature.denominator / 1920} beats`;
function silence(ticks: number) { return new GhostNote({ duration: "w", durationOverride: new Fraction(ticks, 1920) }); }

function voicesFor(measure: Measure, accidentals: Map<string, string>, score: LeadSheet, entryPreview = false) {
  const ticks = measureTicks(score);
  const notes: Tickable[] = [];
  const anchors: { tick: number; note: Tickable }[] = [];
  function append(note: Tickable, tick: number) { notes.push(note); anchors.push({ tick, note }); }
  const rendered: { event: MelodyEvent; note: StaveNote }[] = [];
  const rests = notationRests(measure, ticks);
  function appendRests(from: number, to: number) {
    if (entryPreview) { append(silence(to - from), from); return; }
    for (const rest of rests.filter(r => r.offsetTicks >= from && r.offsetTicks < to)) {
      if (!rest.duration) { append(silence(rest.ticks), rest.offsetTicks); continue; }
      const note = new StaveNote({ keys: ["b/4"], duration: `${rest.duration.denominator}r`, dots: rest.duration.dots });
      if (rest.duration.dots) Dot.buildAndAttach([note]);
      note.setStyle({ fillStyle: STAFF, strokeStyle: STAFF });
      append(note, rest.offsetTicks);
    }
  }
  let cursor = 0;
  for (const event of measure.melody) {
    if (event.offsetTicks > cursor) appendRests(cursor, event.offsetTicks);
    const keys = event.kind === "note" ? [`${event.pitch.step.toLowerCase()}${event.pitch.alter === 1 ? "#" : event.pitch.alter === -1 ? "b" : ""}/${event.pitch.octave}`] : ["b/4"];
    const note = new StaveNote({ keys, duration: `${event.duration.denominator}${event.kind === "rest" ? "r" : ""}`, dots: event.duration.dots });
    if (event.duration.dots) Dot.buildAndAttach([note]);
    const accidental = accidentals.get(event.id);
    if (accidental) note.addModifier(new Accidental(accidental), 0);
    rendered.push({ event, note }); append(note, event.offsetTicks);
    cursor = event.offsetTicks + durationTicks(event.duration);
  }
  if (cursor < ticks) appendRests(cursor, ticks);
  const chords: Tickable[] = [];
  const labels: { event: Measure["chords"][number]; note: TextNote }[] = [];
  cursor = 0;
  for (const chord of measure.chords) {
    if (chord.offsetTicks > cursor) chords.push(silence(chord.offsetTicks - cursor));
    const note = new TextNote({ text: chord.symbol, duration: "w", durationOverride: new Fraction(chord.durationTicks, 1920), font: { family: "Georgia, serif", size: "25px", weight: "bold" } });
    note.setWidth(Math.max(44, note.width) + 12);
    labels.push({ event: chord, note }); chords.push(note);
    cursor = chord.offsetTicks + chord.durationTicks;
  }
  if (cursor < ticks) chords.push(silence(ticks - cursor));
  const time = { numBeats: score.timeSignature.numerator, beatValue: score.timeSignature.denominator };
  const voices = [new Voice(time).addTickables(notes), new Voice(time).addTickables(chords)];
  const formatter = new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]);
  formatter.preCalculateMinTotalWidth(voices);
  // Reserve actual glyph space. The estimator's duration-variance padding treats a
  // whole-bar chord beside quarter notes as dense music and needlessly halves the system.
  return { voices, formatter, rendered, labels, anchors, minimum: Math.max(156, measure.melody.length * 40 + 28, formatter.getMinTotalWidth() + 28) };
}

/** Chord and melody voices share tick contexts; connected systems reflow at their measured minimum widths. */
function renderScore(element: HTMLDivElement, score: LeadSheet, available: number, entry: boolean, writtenBars: number): NotationLayout {
  element.dataset.rendered = "false";
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  const context = renderer.getContext();
  const accidentals = melodyAccidentals(score);
  const measures = score.measures.map((measure, index) => voicesFor(measure, accidentals, score, index >= writtenBars));
  const header = new Stave(0, 0, 400).addClef("treble").addKeySignature(score.keySignature).addTimeSignature(meterLabel(score));
  const prefix = Math.ceil(header.getNoteStartX()) + 8;
  const systems = scoreSystems(measures.map(measure => measure.minimum), available, prefix);
  const width = Math.max(available, ...systems.map(system => system.width));
  // Extreme pitches and stems must clear the chord line and the following system.
  const pitches = score.measures.flatMap(measure => measure.melody.flatMap(event => event.kind === "note" ? [event.pitch.octave * 7 + "CDEFGAB".indexOf(event.pitch.step) - 30] : []));
  const above = Math.max(0, (Math.max(8, ...pitches) - 8) * 5);
  const below = Math.max(0, -Math.min(0, ...pitches) * 5);
  const rowHeight = (entry ? 274 : 196) + above + below;
  const height = systems.length * rowHeight + 12;
  renderer.resize(width, height);
  context.setFillStyle(INK).setStrokeStyle(INK);
  const bars: BarTarget[] = [];
  const targets: ChordTarget[] = [];
  const melodyTargets: MelodyTarget[] = [];
  const rendered: { event: MelodyEvent; note: StaveNote; row: number }[] = [];
  systems.forEach((system, row) => {
    for (let column = 0; column < system.count; column++) {
      const index = system.start + column;
      const left = column * system.barWidth + (column ? prefix : 0);
      const barWidth = system.barWidth + (column === 0 ? prefix : 0);
      const top = row * rowHeight;
      const stave = new Stave(left, top + 28 + above, barWidth);
      if (column === 0) stave.addClef("treble").addKeySignature(score.keySignature); else stave.setBegBarType(BarlineType.NONE);
      if (index === 0) stave.addTimeSignature(meterLabel(score));
      stave.setStyle({ strokeStyle: STAFF, fillStyle: INK });
      stave.setContext(context).draw();
      context.setFillStyle(STAFF).setFont("Arial", "12px").fillText(String(index + 1), left + 8, top + 16);
      context.setFillStyle(INK).setStrokeStyle(INK);
      const measure = measures[index];
      measure.labels.forEach(label => label.note.setLine(-0.7 - above / 10));
      measure.formatter.formatToStave(measure.voices, stave);
      measure.voices.forEach(voice => voice.draw(context, stave));
      rendered.push(...measure.rendered.map(item => ({ ...item, row })));
      bars.push({ index, left, top: top + 2, width: barWidth, height: rowHeight - 20, bottom: stave.getYForLine(4),
        points: [...measure.anchors.map(a => ({ tick: a.tick, x: a.note.getAbsoluteX() + 6 })), { tick: measureTicks(score), x: left + barWidth - 20 }] });
      measure.labels.forEach(({ event, note }) => targets.push({ id: event.id, symbol: event.symbol, bar: index, offset: event.offsetTicks, duration: event.durationTicks,
        left: note.getAbsoluteX() + note.getTickContext().getMetrics().glyphPx / 2 - 4, top, width: note.getWidth() }));
      measure.rendered.forEach(({ event, note }, noteIndex) => {
        const bounds = note.getBoundingBox();
        const previous = measure.rendered[noteIndex - 1]?.note;
        const next = measure.rendered[noteIndex + 1]?.note;
        const before = previous ? (previous.getAbsoluteX() + note.getAbsoluteX()) / 2 + 6 : stave.getNoteStartX() - 8;
        const after = next ? (note.getAbsoluteX() + next.getAbsoluteX()) / 2 + 6 : left + barWidth - 2;
        const x = Math.min(after - 1, Math.max(before, bounds.x - 8));
        melodyTargets.push({ id: event.id, event, bar: index, x: note.getAbsoluteX() + 6,
          y: event.kind === "note" ? stave.getYForLine(4) - (event.pitch.octave * 7 + "CDEFGAB".indexOf(event.pitch.step) - 30) * 5 : stave.getYForLine(2),
          label: `${melodyLabel(event)}, bar ${index + 1}, beat ${beatLabel(event.offsetTicks, score)}`,
          left: x, top: Math.max(top + 44, bounds.y - 7), width: Math.max(1, Math.min(after, Math.max(bounds.x + bounds.w + 8, x + 32)) - x),
          height: Math.max(44, bounds.h + 14) });
      });
    }
  });
  rendered.forEach((item, index) => {
    if (item.event.kind !== "note" || !item.event.tieToNext) return;
    const next = rendered[index + 1];
    if (!next) return;
    if (item.row === next.row) new StaveTie({ firstNote: item.note, lastNote: next.note, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw();
    else {
      new StaveTie({ firstNote: item.note, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw();
      new StaveTie({ lastNote: next.note, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw();
    }
  });
  const svg = element.querySelector("svg");
  svg?.setAttribute("role", "img");
  svg?.setAttribute("aria-label", `${score.title}, ${score.measures.length} measures of melody and chords, ${settingsLabel(score)}`);
  element.dataset.rendered = "true";
  return { width, height, chords: targets, melody: melodyTargets, bars };
}

export function ScorePreview({ score, melody, editing, practice }: { score: LeadSheet; melody: boolean; editing?: ScoreEditing;
  practice?: { bar: number; chordId: string | null; selectBar: (bar: number) => void; selectChord: (id: string) => void } }) {
  const viewport = useRef<HTMLDivElement>(null);
  const notation = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [layout, setLayout] = useState<NotationLayout | null>(null);
  const [error, setError] = useState("");
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const noteDrag = useRef<{ pointer: number; y: number; original: Pitch; pitch: Pitch; position: ChordPosition; id?: string; x: number; bottom: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const melodyEntry = editing?.lane === "melody";
  const cursor = melodyEntry ? nextMelodyPosition(score) : editing?.position;
  const suppressClick = useRef(false);
  const pointers = useRef(new Set<number>());
  useEffect(() => {
    const activePointers = pointers.current;
    const release = (event: globalThis.PointerEvent) => activePointers.delete(event.pointerId);
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { drag.current = null; noteDrag.current = null; setGhost(null); setDrop(null); suppressClick.current = true; } };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    window.addEventListener("keydown", cancel);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("keydown", cancel); };
  }, []);
  const [drop, setDrop] = useState<ChordPosition | null>(null);
  const practiceBar = practice?.bar;
  const practiceChordId = practice?.chordId;
  useEffect(() => {
    if (practiceBar === undefined || !viewport.current) return;
    (viewport.current.querySelector('[data-practice-chord-current="true"]') ??
      viewport.current.querySelector('[data-practice-current="true"]'))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [practiceBar, practiceChordId, melody, layout]);
  const measures = useMemo(() => cursor?.measureIndex === score.measures.length && score.measures.length < 256
    ? [...score.measures, { id: "next-bar-preview", chords: [], melody: [] }] : score.measures, [score, cursor?.measureIndex]);
  useEffect(() => {
    if (melodyEntry) viewport.current?.querySelector('.inline-note-tools')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [melodyEntry, editing?.selectedId, cursor?.measureIndex, cursor?.offsetTicks, layout]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const value = Math.floor(entries[0].contentRect.width); if (value > 0) setWidth(value); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!melody) return;
    void document.fonts.ready.then(() => {
      if (cancelled || !notation.current) return;
      try { setLayout(renderScore(notation.current, { ...score, measures }, width, melodyEntry, score.measures.length)); setError(""); }
      catch { notation.current.replaceChildren(); setLayout(null); setError("The score preview could not be drawn. Try reloading the page."); }
    });
    return () => { cancelled = true; };
  }, [score, measures, melody, width, melodyEntry]);
  const segments = useMemo(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    if (canvas) canvas.font = "bold 42px Georgia, serif";
    return measures.map(measure => chordSegments(measure, text => canvas?.measureText(text).width ?? text.length * 26, measureTicks(score)));
  }, [measures, score]);
  const systems = scoreSystems(segments.map(items => Math.max(174, 24 + items.reduce((sum, item) => sum + item.minimum, 0))), width);
  function destination(clientX: number, clientY: number): ChordPosition | null {
    if (!viewport.current) return null;
    if (melody && layout && notation.current) {
      const rect = notation.current.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
      const bar = layout.bars.find(b => x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height);
      if (!bar) return null;
      return { measureIndex: bar.index, offsetTicks: scoreTickAtX(bar.points, x, measureTicks(score)) };
    }
    for (const element of viewport.current.querySelectorAll<HTMLElement>('[data-entry-bar]')) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const index = Number(element.dataset.entryBar);
        const slots = positionChordSegments(segments[index], rect.width);
        const points = [...slots.map(slot => ({ tick: slot.start, x: slot.left })), { tick: measureTicks(score), x: rect.width - 12 }];
        return { measureIndex: index, offsetTicks: scoreTickAtX(points, clientX - rect.left, measureTicks(score)) };
      }
    }
    return null;
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    pointers.current.add(event.pointerId);
    if (!editing?.writable || event.button !== 0) return;
    if (pointers.current.size > 1) { drag.current = null; noteDrag.current = null; setGhost(null); setDrop(null); suppressClick.current = true; return; }
    suppressClick.current = false;
    const target = event.target as Element;
    const note = layout?.melody.find(n => n.id === target.closest<HTMLElement>('[data-note-id]')?.dataset.noteId);
    if (melodyEntry && editing.placeNote && (note || target.closest('[data-entry-cursor]')) && notation.current) {
      const bar = layout?.bars.find(b => b.index === (note?.bar ?? cursor?.measureIndex));
      if (!bar || !cursor) return;
      const y = event.clientY - notation.current.getBoundingClientRect().top;
      const original = note?.event.kind === "note" ? note.event.pitch : pitchAt(Math.round((bar.bottom - y) / 5));
      const x = note?.x ?? cursorX(bar, cursor.offsetTicks);
      editing.pause?.(); suppressClick.current = false;
      noteDrag.current = { pointer: event.pointerId, y: event.clientY, original, pitch: original,
        position: note ? { measureIndex: note.bar, offsetTicks: note.event.offsetTicks } : cursor, id: note?.id, x, bottom: bar.bottom, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); previewNote(noteDrag.current); return;
    }
    const chord = (event.target as Element).closest<HTMLElement>('[data-chord-id]');
    if (!chord) return;
    editing.pause?.(); suppressClick.current = false;
    drag.current = { id: chord.dataset.chordId!, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const note = noteDrag.current;
    if (note?.pointer === event.pointerId) {
      const shift = Math.round((note.y - event.clientY) / 5);
      note.moved ||= shift !== 0;
      note.pitch = shift ? pitchAt(note.original.octave * 7 + "CDEFGAB".indexOf(note.original.step) - 30 + shift) : note.original;
      event.preventDefault(); suppressClick.current = true; previewNote(note); return;
    }
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.moved ||= Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6;
    if (current.moved) { event.preventDefault(); suppressClick.current = true; setDrop(destination(event.clientX, event.clientY)); }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const note = noteDrag.current;
    if (note?.pointer === event.pointerId) {
      noteDrag.current = null; setGhost(null); suppressClick.current = true;
      const rect = notation.current?.getBoundingClientRect();
      if (rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        if (note.id && !note.moved) editing?.selectMelody(note.id);
        else editing?.placeNote?.(note.position, note.pitch, note.id);
      }
      return;
    }
    const current = drag.current; drag.current = null; setDrop(null);
    if (!current || current.pointer !== event.pointerId) return;
    if (current.moved) { const target = destination(event.clientX, event.clientY); if (target) editing?.moveChord?.(current.id, target); }
    else { suppressClick.current = true; editing?.selectChord(current.id); }
  }
  function pitchAt(step: number): Pitch {
    const absolute = Math.max(21, Math.min(48, step + 30)), name = "CDEFGAB"[absolute % 7] as Pitch["step"];
    return { step: name, alter: keyAccidentals(score.keySignature)[name], octave: Math.floor(absolute / 7) as Pitch["octave"] };
  }
  function previewNote(note: NonNullable<typeof noteDrag.current>) {
    setGhost({ x: note.x, y: note.bottom - (note.pitch.octave * 7 + "CDEFGAB".indexOf(note.pitch.step) - 30) * 5,
      label: `${note.pitch.step}${note.pitch.alter === 1 ? "♯" : note.pitch.alter === -1 ? "♭" : ""}${note.pitch.octave}` });
  }
  function cursorX(bar: BarTarget, tick: number) {
    const after = bar.points.find(p => p.tick >= tick) ?? bar.points.at(-1)!;
    const before = bar.points.filter(p => p.tick <= tick).at(-1) ?? after;
    return after.tick === before.tick ? before.x : before.x + (after.x - before.x) * (tick - before.tick) / (after.tick - before.tick);
  }
  const selectedGroup = editing?.selectedId ? melodyGroup(score, editing.selectedId) : null;
  const selectedNote = layout?.melody.find(n => n.id === editing?.selectedId);
  const restBar = layout?.bars.find(b => b.index === (selectedNote?.bar ?? cursor?.measureIndex));
  return <div ref={viewport} className="score-scroll" aria-label={editing ? editing.lane === "melody" ? "Editable melody score" : "Editable chord score" : melody ? "Melody score" : "Chord-only score"}
    onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => { pointers.current.delete(event.pointerId); drag.current = null; noteDrag.current = null; setGhost(null); setDrop(null); suppressClick.current = true; }}
    onKeyDown={event => { if (event.key === "Escape") { drag.current = null; noteDrag.current = null; setGhost(null); setDrop(null); suppressClick.current = true; } }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {drop && <div className="drop-position" role="status">Bar {drop.measureIndex + 1} · beat {beatLabel(drop.offsetTicks, score)}</div>}
    {error && melody && <p role="alert">{error}</p>}
    {melody ? <div className="score-rendering" style={{ width: layout?.width ?? width }}>
      {(editing || practice) && layout?.bars.filter(bar => bar.index === (practice?.bar ?? editing?.position.measureIndex)).map(bar => <div key={bar.index} className="score-current-bar" data-practice-current={practice ? "true" : undefined} style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height }} />)}
      <div ref={notation} className="notation" data-testid="notation" onClick={event => { if (editing?.writable) { const target = melodyEntry ? cursor : destination(event.clientX, event.clientY); if (target) editing.selectPosition(target); } }} />
      {melodyEntry && cursor && layout?.bars.filter(b => b.index === cursor.measureIndex).map(bar => <button key={bar.index} className="melody-entry-cursor" data-entry-cursor
        disabled={!editing?.writable} aria-label="Next note entry line" style={{ left: cursorX(bar, cursor.offsetTicks) - 20, top: bar.bottom - 55 }}
        onClick={event => { if (event.detail === 0) editing?.placeNote?.(cursor, pitchAt(4)); }} />)}
      {melodyEntry && restBar && cursor && <div className="inline-note-tools" style={{ left: Math.max(4, Math.min((layout?.width ?? width) - 320, selectedNote?.x ?? cursorX(restBar, cursor.offsetTicks))), top: restBar.bottom + 35 }}>
        {editing?.durationControl}
        <div className="inline-note-actions">
        <button className="inline-rest" disabled={!editing?.writable} onClick={() => editing?.enterRest?.()} aria-label={selectedNote ? "Replace selected note with rest" : "Insert rest"}>{selectedNote ? "Rest" : "+ Rest"}</button>
        {selectedNote?.event.kind === "note" && <>
          {([-1, 0, 1] as const).map((alter, i) => <button key={alter} aria-label={["Flat", "Natural", "Sharp"][i]} aria-pressed={selectedNote.event.kind === "note" && selectedNote.event.pitch.alter === alter}
            disabled={!editing?.writable} onClick={() => { if (selectedNote.event.kind === "note") editing?.placeNote?.({ measureIndex: selectedNote.bar, offsetTicks: selectedNote.event.offsetTicks }, { ...selectedNote.event.pitch, alter }, selectedNote.id); }}>{["♭", "♮", "♯"][i]}</button>)}
          <button aria-label="Tie to next note" aria-pressed={!!selectedNote.event.tieToNext} disabled={!editing?.writable} onClick={() => editing?.setTie?.(selectedNote.event.kind === "note" && !selectedNote.event.tieToNext)}>Tie</button>
        </>}
        {selectedNote && <button aria-label="Delete selected note" disabled={!editing?.writable} onClick={() => editing?.deleteNote?.()}>Delete</button>}
        </div>
      </div>}
      {ghost && <div className="melody-ghost" style={{ left: ghost.x, top: ghost.y }}><span>{ghost.label}</span></div>}
      {practice && layout?.bars.map(bar => <button key={bar.index} className="practice-bar-target" style={{ left: bar.left + 2, top: bar.top + 2 }}
        aria-label={`Select bar ${bar.index + 1}`} onClick={() => practice.selectBar(bar.index)} />)}
      {practice && layout?.chords.map(chord => <button key={chord.id} className={`notation-chord-target practice-chord-target${practice.chordId === chord.id ? " selected" : ""}`}
        style={{ left: chord.left, top: chord.top, width: Math.max(44, chord.width) }} aria-label={`Select ${chordLabel(chord, score)}`}
        data-practice-chord-current={practice.chordId === chord.id ? "true" : undefined}
        aria-pressed={practice.chordId === chord.id} onClick={() => practice.selectChord(chord.id)}><span className="sr-only">{chord.symbol}</span></button>)}
      {editing && layout?.chords.map(chord => <button key={chord.id} className={`notation-chord-target editable-chord${editing.selectedId === chord.id ? " selected" : ""}`}
        style={{ left: chord.left, top: chord.top, width: Math.max(44, chord.width) }} aria-label={chordLabel(chord, score)} title={chordLabel(chord, score)} aria-pressed={editing.selectedId === chord.id}
        data-chord-id={chord.id} disabled={!editing.writable} onClick={() => editing.selectChord(chord.id)}><span className="sr-only">{chord.symbol}</span></button>)}
      {editing && layout?.melody.map(note => <button key={note.id} className={`notation-note-target editable-melody${selectedGroup?.ids.includes(note.id) ? " selected" : ""}`}
        style={{ left: note.left, top: note.top, width: note.width, height: note.height }} aria-label={note.label} title={note.label} aria-pressed={!!selectedGroup?.ids.includes(note.id)}
        data-note-id={note.id} disabled={!editing.writable} onClick={() => editing.selectMelody(note.id)}><span className="sr-only">{note.label}</span></button>)}
    </div> : <div className="chord-grid">
      {systems.map(system => <div className="chord-system" key={system.start} style={{ width: system.width, gridTemplateColumns: `repeat(${system.columns}, ${system.barWidth}px)` }}>
        {measures.slice(system.start, system.start + system.count).map((measure, column) => {
          const index = system.start + column;
          const current = (practice?.bar ?? editing?.position.measureIndex) === index;
          const slots = positionChordSegments(segments[index], system.barWidth);
          return <section className={`chord-measure${current ? " current" : ""}`} data-entry-bar={index} data-practice-current={practice && current ? "true" : undefined} aria-label={`Bar ${index + 1}`} key={measure.id}
            onClick={event => { if (editing?.writable && !(event.target as Element).closest('button')) { const target = destination(event.clientX, event.clientY); if (target) editing.selectPosition(target); } }}>
            {practice ? <button className="measure-number practice-bar-number" onClick={() => practice.selectBar(index)} aria-label={`Select bar ${index + 1}`}>{index + 1}</button>
              : <span className="measure-number">{index + 1}{index === score.measures.length ? " · next bar" : ""}</span>}
            <div className="chord-symbols">
              {slots.filter(slot => slot.chord).map(slot => {
                const chord = slot.chord!;
                const label = chordLabel({ id: chord.id, symbol: chord.symbol, offset: chord.offsetTicks, duration: chord.durationTicks, bar: index, left: 0, top: 0, width: 0 }, score);
                return editing ? <button key={chord.id} style={{ left: slot.left, width: slot.width }} className={`score-chord editable-chord${editing.selectedId === chord.id ? " selected" : ""}`}
                  data-chord-id={chord.id} aria-label={label} title={label} aria-pressed={editing.selectedId === chord.id} disabled={!editing.writable} onClick={() => editing.selectChord(chord.id)}>{chord.symbol}</button>
                  : practice ? <button className={`score-chord practice-chord${practice.chordId === chord.id ? " selected" : ""}`} key={chord.id}
                      style={{ left: slot.left, width: slot.width }} aria-label={`Select ${label}`} aria-pressed={practice.chordId === chord.id}
                      data-practice-chord-current={practice.chordId === chord.id ? "true" : undefined}
                      onClick={() => practice.selectChord(chord.id)}>{chord.symbol}</button>
                    : <span className="score-chord" key={chord.id} style={{ left: slot.left, width: slot.width }} title={label}>{chord.symbol}</span>;
              })}
            </div>
            {editing && current && <div className="entry-beats" aria-label={`Choose beat in bar ${index + 1}`}>
              {Array.from({ length: score.timeSignature.numerator }, (_, beat) => <button key={beat} className={editing.position.offsetTicks === beat * 1920 / score.timeSignature.denominator && !editing.selectedId ? "beat-target selected" : "beat-target"}
                disabled={!editing.writable}
                aria-label={`Insert at bar ${index + 1} beat ${beat + 1}`} onClick={() => editing.selectPosition({ measureIndex: index, offsetTicks: beat * 1920 / score.timeSignature.denominator })}>{beat + 1}</button>)}
            </div>}
          </section>;
        })}
      </div>)}
    </div>}
  </div>;
}
