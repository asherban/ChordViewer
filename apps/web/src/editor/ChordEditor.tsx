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
