import { useEffect, useMemo, useRef, useState } from "react";
import { durationTicks, measureTicks, type ChordPosition, type LeadSheet, type MelodyEvent } from "@chordviewer/contracts";
import { Accidental, BarlineType, Dot, Formatter, Fraction, GhostNote, Renderer, Stave, StaveNote, StaveTie, TextNote, Voice, type Tickable } from "vexflow/bravura";
import { melodyAccidentals } from "./accidentals";
import { chordSegments, positionChordSegments, scoreSystems, type Measure } from "./layout";
import { beatLabel, melodyLabel, meterLabel, settingsLabel } from "./labels";

export type ScoreEditing = {
  position: ChordPosition; selectedId: string | null; writable: boolean;
  lane: "chords" | "melody";
  selectChord: (id: string) => void; selectMelody: (id: string) => void; selectPosition: (position: ChordPosition) => void;
};
type ChordTarget = { id: string; symbol: string; offset: number; duration: number; bar: number; left: number; top: number; width: number };
type BarTarget = { index: number; left: number; top: number; width: number; height: number };
type MelodyTarget = { id: string; label: string; left: number; top: number; width: number; height: number };
type NotationLayout = { width: number; height: number; chords: ChordTarget[]; melody: MelodyTarget[]; bars: BarTarget[] };
const INK = "#18332f";
const STAFF = "#79867d";
const chordLabel = (chord: ChordTarget, score: LeadSheet) => `${chord.symbol}, bar ${chord.bar + 1}, beat ${beatLabel(chord.offset, score)}, ${chord.duration * score.timeSignature.denominator / 1920} beats`;
function silence(ticks: number) { return new GhostNote({ duration: "w", durationOverride: new Fraction(ticks, 1920) }); }

function voicesFor(measure: Measure, accidentals: Map<string, string>, score: LeadSheet) {
  const ticks = measureTicks(score);
  const notes: Tickable[] = [];
  const rendered: { event: MelodyEvent; note: StaveNote }[] = [];
  let cursor = 0;
  for (const event of measure.melody) {
    if (event.offsetTicks > cursor) notes.push(silence(event.offsetTicks - cursor));
    const keys = event.kind === "note" ? [`${event.pitch.step.toLowerCase()}${event.pitch.alter === 1 ? "#" : event.pitch.alter === -1 ? "b" : ""}/${event.pitch.octave}`] : ["b/4"];
    const note = new StaveNote({ keys, duration: `${event.duration.denominator}${event.kind === "rest" ? "r" : ""}`, dots: event.duration.dots });
    if (event.duration.dots) Dot.buildAndAttach([note]);
    const accidental = accidentals.get(event.id);
    if (accidental) note.addModifier(new Accidental(accidental), 0);
    rendered.push({ event, note }); notes.push(note);
    cursor = event.offsetTicks + durationTicks(event.duration);
  }
  if (cursor < ticks) notes.push(silence(ticks - cursor));
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
  return { voices, formatter, rendered, labels, minimum: Math.max(156, measure.melody.length * 40 + 28, formatter.getMinTotalWidth() + 28) };
}

/** Chord and melody voices share tick contexts; connected systems reflow at their measured minimum widths. */
function renderScore(element: HTMLDivElement, score: LeadSheet, available: number): NotationLayout {
  element.dataset.rendered = "false";
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  const context = renderer.getContext();
  const accidentals = melodyAccidentals(score);
  const measures = score.measures.map(measure => voicesFor(measure, accidentals, score));
  const header = new Stave(0, 0, 400).addClef("treble").addKeySignature(score.keySignature).addTimeSignature(meterLabel(score));
  const prefix = Math.ceil(header.getNoteStartX()) + 8;
  const systems = scoreSystems(measures.map(measure => measure.minimum), available, prefix);
  const width = Math.max(available, ...systems.map(system => system.width));
  // Extreme pitches and stems must clear the chord line and the following system.
  const pitches = score.measures.flatMap(measure => measure.melody.flatMap(event => event.kind === "note" ? [event.pitch.octave * 7 + "CDEFGAB".indexOf(event.pitch.step) - 30] : []));
  const above = Math.max(0, (Math.max(8, ...pitches) - 8) * 5);
  const below = Math.max(0, -Math.min(0, ...pitches) * 5);
  const rowHeight = 166 + above + below;
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
      bars.push({ index, left, top: top + 2, width: barWidth, height: rowHeight - 20 });
      measure.labels.forEach(({ event, note }) => targets.push({ id: event.id, symbol: event.symbol, bar: index, offset: event.offsetTicks, duration: event.durationTicks,
        left: note.getAbsoluteX() + note.getTickContext().getMetrics().glyphPx / 2 - 4, top, width: note.getWidth() }));
      measure.rendered.forEach(({ event, note }, noteIndex) => {
        const bounds = note.getBoundingBox();
        const previous = measure.rendered[noteIndex - 1]?.note;
        const next = measure.rendered[noteIndex + 1]?.note;
        const before = previous ? (previous.getAbsoluteX() + note.getAbsoluteX()) / 2 + 6 : stave.getNoteStartX() - 8;
        const after = next ? (note.getAbsoluteX() + next.getAbsoluteX()) / 2 + 6 : left + barWidth - 2;
        const x = Math.min(after - 1, Math.max(before, bounds.x - 8));
        melodyTargets.push({ id: event.id, label: `${melodyLabel(event)}, bar ${index + 1}, beat ${beatLabel(event.offsetTicks, score)}`,
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
  useEffect(() => {
    if (!practice || !viewport.current) return;
    (viewport.current.querySelector('[data-practice-chord-current="true"]') ??
      viewport.current.querySelector('[data-practice-current="true"]'))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [practice, melody, layout]);
  const measures = useMemo(() => editing?.position.measureIndex === score.measures.length && score.measures.length < 256
    ? [...score.measures, { id: "next-bar-preview", chords: [], melody: [] }] : score.measures, [score, editing?.position.measureIndex]);
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
      try { setLayout(renderScore(notation.current, { ...score, measures }, width)); setError(""); }
      catch { notation.current.replaceChildren(); setLayout(null); setError("The score preview could not be drawn. Try reloading the page."); }
    });
    return () => { cancelled = true; };
  }, [score, measures, melody, width]);
  const segments = useMemo(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    if (canvas) canvas.font = "bold 42px Georgia, serif";
    return measures.map(measure => chordSegments(measure, text => canvas?.measureText(text).width ?? text.length * 26, measureTicks(score)));
  }, [measures, score]);
  const systems = scoreSystems(segments.map(items => Math.max(174, 24 + items.reduce((sum, item) => sum + item.minimum, 0))), width);
  return <div ref={viewport} className="score-scroll" aria-label={editing ? editing.lane === "melody" ? "Editable melody score" : "Editable chord score" : melody ? "Melody score" : "Chord-only score"}>
    {error && melody && <p role="alert">{error}</p>}
    {melody ? <div className="score-rendering" style={{ width: layout?.width ?? width }}>
      {(editing || practice) && layout?.bars.filter(bar => bar.index === (practice?.bar ?? editing?.position.measureIndex)).map(bar => <div key={bar.index} className="score-current-bar" data-practice-current={practice ? "true" : undefined} style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height }} />)}
      <div ref={notation} className="notation" data-testid="notation" />
      {practice && layout?.bars.map(bar => <button key={bar.index} className="practice-bar-target" style={{ left: bar.left + 2, top: bar.top + 2 }}
        aria-label={`Select bar ${bar.index + 1}`} onClick={() => practice.selectBar(bar.index)} />)}
      {practice && layout?.chords.map(chord => <button key={chord.id} className={`notation-chord-target practice-chord-target${practice.chordId === chord.id ? " selected" : ""}`}
        style={{ left: chord.left, top: chord.top, width: Math.max(44, chord.width) }} aria-label={`Select ${chordLabel(chord, score)}`}
        data-practice-chord-current={practice.chordId === chord.id ? "true" : undefined}
        aria-pressed={practice.chordId === chord.id} onClick={() => practice.selectChord(chord.id)}><span className="sr-only">{chord.symbol}</span></button>)}
      {editing && layout?.chords.map(chord => <button key={chord.id} className={`notation-chord-target editable-chord${editing.selectedId === chord.id ? " selected" : ""}`}
        style={{ left: chord.left, top: chord.top, width: Math.max(44, chord.width) }} aria-label={chordLabel(chord, score)} title={chordLabel(chord, score)} aria-pressed={editing.selectedId === chord.id}
        disabled={!editing.writable} onClick={() => editing.selectChord(chord.id)}><span className="sr-only">{chord.symbol}</span></button>)}
      {editing && layout?.melody.map(note => <button key={note.id} className={`notation-note-target editable-melody${editing.selectedId === note.id ? " selected" : ""}`}
        style={{ left: note.left, top: note.top, width: note.width, height: note.height }} aria-label={note.label} title={note.label} aria-pressed={editing.selectedId === note.id}
        disabled={!editing.writable} onClick={() => editing.selectMelody(note.id)}><span className="sr-only">{note.label}</span></button>)}
    </div> : <div className="chord-grid">
      {systems.map(system => <div className="chord-system" key={system.start} style={{ width: system.width, gridTemplateColumns: `repeat(${system.columns}, ${system.barWidth}px)` }}>
        {measures.slice(system.start, system.start + system.count).map((measure, column) => {
          const index = system.start + column;
          const current = (practice?.bar ?? editing?.position.measureIndex) === index;
          const slots = positionChordSegments(segments[index], system.barWidth);
          return <section className={`chord-measure${current ? " current" : ""}`} data-practice-current={practice && current ? "true" : undefined} aria-label={`Bar ${index + 1}`} key={measure.id}>
            {practice ? <button className="measure-number practice-bar-number" onClick={() => practice.selectBar(index)} aria-label={`Select bar ${index + 1}`}>{index + 1}</button>
              : <span className="measure-number">{index + 1}{index === score.measures.length ? " · next bar" : ""}</span>}
            <div className="chord-symbols">
              {slots.filter(slot => slot.chord).map(slot => {
                const chord = slot.chord!;
                const label = chordLabel({ id: chord.id, symbol: chord.symbol, offset: chord.offsetTicks, duration: chord.durationTicks, bar: index, left: 0, top: 0, width: 0 }, score);
                return editing ? <button key={chord.id} style={{ left: slot.left, width: slot.width }} className={`score-chord editable-chord${editing.selectedId === chord.id ? " selected" : ""}`}
                  aria-label={label} title={label} aria-pressed={editing.selectedId === chord.id} disabled={!editing.writable} onClick={() => editing.selectChord(chord.id)}>{chord.symbol}</button>
                  : practice ? <button className={`score-chord practice-chord${practice.chordId === chord.id ? " selected" : ""}`} key={chord.id}
                      style={{ left: slot.left, width: slot.width }} aria-label={`Select ${label}`} aria-pressed={practice.chordId === chord.id}
                      data-practice-chord-current={practice.chordId === chord.id ? "true" : undefined}
                      onClick={() => practice.selectChord(chord.id)}>{chord.symbol}</button>
                    : <span className="score-chord" key={chord.id} style={{ left: slot.left, width: slot.width }} title={label}>{chord.symbol}</span>;
              })}
            </div>
            {editing && current && <div className="entry-beats" aria-label={`Choose beat in bar ${index + 1}`}>
              {Array.from({ length: score.timeSignature.numerator }, (_, beat) => <button key={beat} className={editing.position.offsetTicks === beat * 1920 / score.timeSignature.denominator && !editing.selectedId ? "beat-target selected" : "beat-target"}
                disabled={!editing.writable || measure.chords.some(chord => chord.offsetTicks <= beat * 1920 / score.timeSignature.denominator && chord.offsetTicks + chord.durationTicks > beat * 1920 / score.timeSignature.denominator)}
                aria-label={`Insert at bar ${index + 1} beat ${beat + 1}`} onClick={() => editing.selectPosition({ measureIndex: index, offsetTicks: beat * 1920 / score.timeSignature.denominator })}>{beat + 1}</button>)}
            </div>}
          </section>;
        })}
      </div>)}
    </div>}
  </div>;
}
