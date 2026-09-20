import { useEffect, useRef, useState } from "react";
import {
  durationTicks,
  type LeadSheet,
  type MelodyEvent,
} from "@chordviewer/contracts";
import {
  Accidental,
  Dot,
  Formatter,
  Fraction,
  GhostNote,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  TextNote,
  Voice,
  type Tickable,
} from "vexflow/bravura";
import { melodyAccidentals } from "./accidentals";

function silence(ticks: number): GhostNote {
  return new GhostNote({
    duration: "w",
    durationOverride: new Fraction(ticks, 1920),
  });
}

/** Chord and melody voices share tick contexts so off-beat chords keep their own timeline. */
function renderScore(element: HTMLDivElement, score: LeadSheet) {
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  const rows = Math.ceil(score.measures.length / 2);
  renderer.resize(880, rows * 205 + 25);
  const context = renderer.getContext();
  const accidentals = melodyAccidentals(score);
  const rendered: { event: MelodyEvent; note: StaveNote; row: number }[] = [];
  score.measures.forEach((measure, index) => {
    const row = Math.floor(index / 2);
    const stave = new Stave(18 + (index % 2) * 420, 45 + row * 205, 420);
    if (index % 2 === 0) stave.addClef("treble");
    if (index === 0) stave.addTimeSignature("4/4");
    stave.setContext(context).draw();
    context
      .setFont("Arial", 11)
      .fillText(String(index + 1), stave.getX() + 6, 35 + row * 205);
    const notes: Tickable[] = [];
    let cursor = 0;
    for (const event of measure.melody) {
      if (event.offsetTicks > cursor)
        notes.push(silence(event.offsetTicks - cursor));
      const keys =
        event.kind === "note"
          ? [
              `${event.pitch.step.toLowerCase()}${event.pitch.alter === 1 ? "#" : event.pitch.alter === -1 ? "b" : ""}/${event.pitch.octave}`,
            ]
          : ["b/4"];
      const note = new StaveNote({
        keys,
        duration: `${event.duration.denominator}${event.kind === "rest" ? "r" : ""}`,
        dots: event.duration.dots,
      });
      if (event.duration.dots) Dot.buildAndAttach([note]);
      if (event.kind === "note") {
        const accidental = accidentals.get(event.id);
        if (accidental) note.addModifier(new Accidental(accidental), 0);
      }
      rendered.push({ event, note, row });
      notes.push(note);
      cursor = event.offsetTicks + durationTicks(event.duration);
    }
    if (cursor < 1920) notes.push(silence(1920 - cursor));
    const chords: Tickable[] = [];
    cursor = 0;
    for (const chord of measure.chords) {
      if (chord.offsetTicks > cursor)
        chords.push(silence(chord.offsetTicks - cursor));
      chords.push(
        new TextNote({
          text: chord.symbol,
          duration: "w",
          durationOverride: new Fraction(chord.durationTicks, 1920),
          font: { family: "Arial", size: 14, weight: "bold" },
        }).setLine(-1.4),
      );
      cursor = chord.offsetTicks + chord.durationTicks;
    }
    if (cursor < 1920) chords.push(silence(1920 - cursor));
    const voices = [
      new Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes),
      new Voice({ numBeats: 4, beatValue: 4 }).addTickables(chords),
    ];
    new Formatter()
      .joinVoices([voices[0]])
      .joinVoices([voices[1]])
      .formatToStave(voices, stave);
    voices.forEach((voice) => voice.draw(context, stave));
  });
  rendered.forEach((item, index) => {
    if (item.event.kind !== "note" || !item.event.tieToNext) return;
    const next = rendered[index + 1];
    if (!next) return; // The parser rejects dangling ties before rendering.
    if (item.row === next.row)
      new StaveTie({
        firstNote: item.note,
        lastNote: next.note,
        firstIndexes: [0],
        lastIndexes: [0],
      })
        .setContext(context)
        .draw();
    else {
      new StaveTie({
        firstNote: item.note,
        firstIndexes: [0],
        lastIndexes: [0],
      })
        .setContext(context)
        .draw();
      new StaveTie({ lastNote: next.note, firstIndexes: [0], lastIndexes: [0] })
        .setContext(context)
        .draw();
    }
  });
  const svg = element.querySelector("svg");
  svg?.setAttribute("role", "img");
  svg?.setAttribute(
    "aria-label",
    `${score.title}, ${score.measures.length} measures of melody and chords in C major, 4/4`,
  );
  element.dataset.rendered = "true";
}

export function ScorePreview({
  score,
  melody,
}: {
  score: LeadSheet;
  melody: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!melody) return;
    void document.fonts.ready.then(() => {
      if (cancelled || !container.current) return;
      try {
        renderScore(container.current, score);
        setError("");
      } catch {
        setError(
          "The score preview could not be drawn. Try reloading the page.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [score, melody]);
  if (!melody)
    return (
      <div className="chord-grid" aria-label="Chord-only score">
        {score.measures.map((measure, index) => (
          <div className="chord-measure" key={measure.id}>
            <span className="measure-number">{index + 1}</span>
            <div>
              {measure.chords.map((chord) => (
                <span
                  key={chord.id}
                  style={{ left: `${(chord.offsetTicks / 1920) * 100}%` }}
                >
                  {chord.symbol}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="score-scroll">
        <div ref={container} className="notation" data-testid="notation" />
      </div>
    </>
  );
}
