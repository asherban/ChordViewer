import { useState, type FormEvent } from "react";
import { CHORD_DURATIONS, findChord } from "@chordviewer/contracts";
import { ChordDraft, type DraftSnapshot } from "./ChordDraft";

const durationLabel = (ticks: number) => `${ticks / 480} ${ticks === 480 ? "beat" : "beats"}${ticks === 1920 ? " · one bar" : ""}`;
const beatLabel = (ticks: number) => String(ticks / 480 + 1);

function Correction({ model, view }: { model: ChordDraft; view: DraftSnapshot }) {
  const selected = !view.pending && view.selectedId ? findChord(view.score, view.selectedId)?.event : null;
  const [symbol, setSymbol] = useState(selected?.symbol ?? view.alternatives[0] ?? "");
  const [duration, setDuration] = useState(selected?.durationTicks ?? view.duration);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (selected) model.changeSelected(symbol, duration);
    else model.applyPending(symbol);
  }
  return <form className="chord-correction" aria-label={selected ? "Change chord" : "Captured chord"} onSubmit={submit}>
    <div className="correction-fields">
      <label className="field">Chord symbol<input value={symbol} maxLength={64} required disabled={!view.writable}
        onChange={event => setSymbol(event.target.value)} placeholder="For example, Cmaj7/E" /></label>
      {selected && <label className="field">Chord duration<select value={duration} disabled={!view.writable}
        onChange={event => setDuration(Number(event.target.value))}>
        {CHORD_DURATIONS.map(value => <option key={value} value={value}>{durationLabel(value)}</option>)}
      </select></label>}
    </div>
    {!!view.alternatives.length && <div className="chord-alternatives" aria-label="Chord name alternatives">
      {view.alternatives.map(value => <button type="button" className="secondary" key={value} disabled={!view.writable}
        onClick={() => setSymbol(value)}>{value}</button>)}
    </div>}
    <div className="actions">
      <button className="primary" disabled={!view.writable || !symbol.trim()}>{selected ? "Apply chord changes" : "Insert captured chord"}</button>
      {selected ? <>
        <button type="button" className="secondary" disabled={!view.canCapture} onClick={() => model.arm(true)}>Replace from MIDI</button>
        <button type="button" className="secondary danger" disabled={!view.writable} onClick={model.deleteSelected}>Delete chord</button>
      </> : <button type="button" className="secondary" onClick={() => model.discardPending()}>Discard capture</button>}
    </div>
  </form>;
}

export function ChordEntryControls({ model, view }: { model: ChordDraft; view: DraftSnapshot }) {
  return <section className="entry-controls" aria-label="Chord entry">
    <div className="entry-control-row">
      <span className={view.entry === "paused" ? "entry-badge" : "entry-badge armed"}>
        {view.entry === "paused" ? "Entry paused" : view.entry === "replace" ? "Replacing one chord" : "MIDI entry on"}
      </span>
      {view.entry === "paused"
        ? <button className="primary" disabled={!view.canCapture || !!view.selectedId || !!view.pending} onClick={() => model.arm()}>Start MIDI entry</button>
        : <button className="primary" onClick={model.pause}>Pause entry</button>}
      <button className="secondary" disabled={!view.writable || !view.undoCount} onClick={model.undo}>Undo</button>
      <button className="secondary" disabled={!view.writable || !view.redoCount} onClick={model.redo}>Redo</button>
    </div>
    <div className="entry-target-row">
      <label>New chord duration<select aria-label="New chord duration" disabled={!view.writable}
        value={view.duration} onChange={event => model.setDuration(Number(event.target.value))}>
        {CHORD_DURATIONS.map(duration => <option value={duration} key={duration}>{durationLabel(duration)}</option>)}
      </select></label>
      <label>Bar<select aria-label="Insertion bar" value={Math.min(view.position.measureIndex, 255)} disabled={!view.writable}
        onChange={event => model.selectPosition({ measureIndex: Number(event.target.value), offsetTicks: view.position.offsetTicks })}>
        {Array.from({ length: Math.min(256, view.score.measures.length + 1) }, (_, index) => <option key={index} value={index}>
          {index + 1}{index === view.score.measures.length ? " · next bar" : ""}
        </option>)}
      </select></label>
      <label>Beat<select aria-label="Insertion beat" value={view.position.offsetTicks} disabled={!view.writable}
        onChange={event => model.selectPosition({ ...view.position, offsetTicks: Number(event.target.value) })}>
        {Array.from({ length: 8 }, (_, index) => <option key={index} value={index * 240}>{beatLabel(index * 240)}</option>)}
      </select></label>
    </div>
    <p role="status" className="entry-notice">{view.notice}</p>
    {!view.canCapture && <p className="small">Connect MIDI and close other editing panels to start entry.</p>}
    {(view.selectedId || view.pending) && <Correction
      key={view.pending ? "pending:" + view.pending.notes.join(",") : view.selectedId + ":" + findChord(view.score, view.selectedId!)?.event.symbol}
      model={model} view={view} />}
    {!view.selectedId && !view.pending && view.lastEventId && !!view.alternatives.length &&
      <button className="text-button" disabled={!view.writable} onClick={() => model.selectChord(view.lastEventId!)}>Change the last chord or choose another name</button>}
  </section>;
}

export function ChordTimeline({ model, view }: { model: ChordDraft; view: DraftSnapshot }) {
  const measures = [...view.score.measures];
  if (view.position.measureIndex === measures.length && measures.length < 256)
    measures.push({ id: "next-bar-preview", chords: [], melody: [] });
  return <div className="editable-chord-grid" aria-label="Editable chord score">
    {measures.map((measure, measureIndex) => <section className={view.position.measureIndex === measureIndex ? "entry-measure current" : "entry-measure"}
      aria-label={`Bar ${measureIndex + 1}`} key={measure.id}>
      <div className="entry-measure-title"><span>Bar {measureIndex + 1}</span>
        {measureIndex === view.score.measures.length && <span>Added when you play</span>}</div>
      <div className="entry-beats">
        {Array.from({ length: 8 }, (_, beat) => {
          const offset = beat * 240;
          const occupied = measure.chords.some(chord => chord.offsetTicks <= offset && chord.offsetTicks + chord.durationTicks > offset);
          return <button key={beat} className={view.position.measureIndex === measureIndex && view.position.offsetTicks === offset && !view.selectedId ? "beat-target selected" : "beat-target"}
            disabled={!view.writable || occupied} aria-label={`Insert at bar ${measureIndex + 1} beat ${beatLabel(offset)}`}
            onClick={() => model.selectPosition({ measureIndex, offsetTicks: offset })}>{beat % 2 === 0 ? beat / 2 + 1 : "·"}</button>;
        })}
      </div>
      <div className="entry-chords">
        {measure.chords.map(chord => <button className={view.selectedId === chord.id ? "editable-chord selected" : "editable-chord"}
          style={{ left: `${chord.offsetTicks / 1920 * 100}%`, width: `${chord.durationTicks / 1920 * 100}%` }}
          aria-label={`${chord.symbol}, bar ${measureIndex + 1}, beat ${beatLabel(chord.offsetTicks)}, ${durationLabel(chord.durationTicks)}`}
          title={`${chord.symbol} · ${durationLabel(chord.durationTicks)}`} disabled={!view.writable}
          aria-pressed={view.selectedId === chord.id} key={chord.id} onClick={() => model.selectChord(chord.id)}>
          <span>{chord.symbol}</span><small>{durationLabel(chord.durationTicks)}</small>
        </button>)}
        {!measure.chords.length && <span className="empty-chord-bar">Choose a beat, then play</span>}
      </div>
    </section>)}
  </div>;
}
