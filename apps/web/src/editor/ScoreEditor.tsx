import { useState, type FormEvent } from "react";
import { CHORD_DURATIONS, findChord, measureTicks } from "@chordviewer/contracts";
import { ScoreDraft, type DraftSnapshot } from "./ScoreDraft";
import { beatLabel } from "../score/labels";

function chordDurations(view: DraftSnapshot) { return [...new Set([...CHORD_DURATIONS, measureTicks(view.score), view.duration])].sort((a, b) => a - b); }
function ChordKeyboard({ model, view, symbol, change }: { model: ScoreDraft; view: DraftSnapshot; symbol: string; change: (symbol: string) => void }) {
  const [root, setRoot] = useState("C"), [quality, setQuality] = useState(""), [accidental, setAccidental] = useState(""), [bass, setBass] = useState(false);
  const pins = view.pinnedChords;
  const recent = [...new Set([...pins, ...view.score.measures.flatMap(m => m.chords).map(c => c.symbol).reverse(), "C", "F", "G", "Am"])].slice(0, 8);
  return <div className="chord-keyboard" aria-label="Chord keyboard">
    <div className="chord-keys" aria-label="Recent and pinned chords">{recent.map(chord => <button type="button" key={chord} disabled={!view.writable} onClick={() => model.addChord(chord)}>{chord}</button>)}</div>
    <div className="chord-keys root-keys">{[..."CDEFGAB"].map(note => <button type="button" key={note} aria-pressed={root === note && !bass} disabled={!view.writable} onClick={() => {
      if (bass) { change(`${symbol.split("/")[0]}/${note}${accidental}`); setBass(false); }
      else { setRoot(note); change(note + accidental + quality); }
    }}>{note}</button>)}</div>
    <div className="chord-keys">{[["", "Major"], ["m", "Minor"], ["7", "7"], ["maj7", "maj7"], ["m7", "m7"], ["dim", "dim"], ["sus4", "sus4"]].map(([suffix, label]) =>
      <button type="button" key={suffix} aria-pressed={quality === suffix} disabled={!view.writable} onClick={() => { setQuality(suffix); change(root + accidental + suffix); }}>{label}</button>)}</div>
    <div className="chord-keys">{[["b", "♭"], ["", "♮"], ["#", "♯"]].map(([value, label]) => <button type="button" key={value} disabled={!view.writable} aria-pressed={accidental === value}
      onClick={() => { setAccidental(value); if (!bass) change(root + value + quality); }}>{label}</button>)}
      <button type="button" aria-pressed={bass} disabled={!view.writable || !symbol} onClick={() => setBass(!bass)}>Slash bass</button>
      <button type="button" disabled={!view.writable || !symbol.trim() || [...symbol.trim()].length > 32} aria-pressed={pins.includes(symbol.trim())} onClick={() => model.togglePinnedChord(symbol)}>{pins.includes(symbol.trim()) ? "Unpin chord" : "Pin chord"}</button>
    </div>
  </div>;
}
const chordDurationLabel = (ticks: number, view: DraftSnapshot) => ticks === measureTicks(view.score) && !view.selectedId ? "To bar end" : `${ticks * view.score.timeSignature.denominator / 1920} beats`;
function ChordForm({ model, view, manual, close }: { model: ScoreDraft; view: DraftSnapshot; manual?: boolean; close?: () => void }) {
  const selected = !view.pending && view.selectedId ? findChord(view.score, view.selectedId)?.event : null;
  const [symbol, setSymbol] = useState(selected?.symbol ?? view.alternatives[0] ?? "");
  const [duration, setDuration] = useState(selected?.durationTicks ?? view.duration);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (manual) { model.addChord(symbol); }
    else if (selected) model.changeSelected(symbol, duration);
    else model.applyPending(symbol);
  }
  return <form className="chord-correction" aria-label={manual ? "Add chord" : selected ? "Change chord" : "Captured chord"} onSubmit={submit}
    onFocusCapture={event => { if (event.target.matches("input,select")) model.pause(); }}>
    {manual && <ChordKeyboard view={view} model={model} symbol={symbol} change={setSymbol} />}
    <div className="correction-fields">
      <label className="field">Chord symbol<input value={symbol} maxLength={64} required disabled={!view.writable}
        onChange={event => setSymbol(event.target.value)} placeholder="For example, Cmaj7/E" /></label>
      {selected && <label className="field">Chord duration<select value={duration} disabled={!view.writable} onChange={event => setDuration(Number(event.target.value))}>
        {chordDurations(view).map(value => <option key={value} value={value}>{chordDurationLabel(value, view)}</option>)}
      </select></label>}
    </div>
    {!!view.alternatives.length && <div className="chord-alternatives" aria-label="Chord name alternatives">
      {view.alternatives.map(value => <button type="button" className="secondary" key={value} disabled={!view.writable} onClick={() => setSymbol(value)}>{value}</button>)}
    </div>}
    <div className="actions">
      <button className="primary" disabled={!view.writable || !symbol.trim()}>{manual ? "Add chord" : selected ? "Apply chord changes" : "Insert captured chord"}</button>
      {selected ? <>
        <button type="button" className="secondary" disabled={!view.canCapture} onClick={() => model.arm(true)}>Replace from MIDI</button>
        <button type="button" className="secondary danger" disabled={!view.writable} onClick={model.deleteSelected}>Delete chord</button>
      </> : manual ? <button type="button" className="secondary" onClick={close}>Done</button>
        : <button type="button" className="secondary" onClick={() => model.discardPending()}>Discard capture</button>}
    </div>
  </form>;
}

export function ScoreEntryControls({ model, view }: { model: ScoreDraft; view: DraftSnapshot }) {
  const [manual, setManual] = useState(true);
  const ticks = measureTicks(view.score);
  const offsets = [...new Set([...Array.from({ length: ticks / 60 }, (_, index) => index * 60), view.position.offsetTicks])].sort((a, b) => a - b);
  const formKey = view.pending ? `pending:${view.pending.lane}:${view.pending.notes.join(",")}` : `${view.lane}:${view.selectedId}`;
  return <section className="entry-controls" aria-label="Score entry">
    <div className="entry-control-row">
      <div className="segmented entry-pass" aria-label="Entry pass">
        <button aria-pressed={view.lane === "chords"} disabled={!view.writable} onClick={() => { setManual(true); model.setLane("chords"); }}>Chord entry</button>
        <button aria-pressed={view.lane === "melody"} disabled={!view.writable} onClick={() => { setManual(false); model.setLane("melody"); }}>Melody entry</button>
      </div>
      <span className={view.entry === "paused" ? "entry-badge" : "entry-badge armed"}>
        {view.entry === "paused" ? "Entry paused" : view.entry === "replace" ? "Replacing selection" : "MIDI entry on"}
      </span>
      {view.entry === "paused" ? <button className="primary" disabled={!view.canCapture || (view.lane === "chords" && !!view.selectedId) || !!view.pending} onClick={() => model.arm(view.lane === "melody" && !!view.selectedId)}>{view.lane === "melody" && view.selectedId ? "Replace from MIDI" : "Start MIDI entry"}</button>
        : <button className="primary" onClick={model.pause}>Pause entry</button>}
      <button className="secondary" disabled={!view.writable || !view.undoCount} onClick={() => { setManual(false); model.undo(); }}>Undo</button>
      <button className="secondary" disabled={!view.writable || !view.redoCount} onClick={() => { setManual(false); model.redo(); }}>Redo</button>
    </div>
    {view.lane === "chords" && <div className="entry-target-row">
      <label>New chord duration<select aria-label="New chord duration" disabled={!view.writable} value={view.duration} onChange={event => model.setDuration(Number(event.target.value))}>
        {chordDurations(view).map(duration => <option value={duration} key={duration}>{chordDurationLabel(duration, view)}</option>)}
      </select></label>
      <label>Bar<select aria-label="Insertion bar" value={Math.min(view.position.measureIndex, 255)} disabled={!view.writable}
        onChange={event => model.selectPosition({ measureIndex: Number(event.target.value), offsetTicks: Math.min(view.position.offsetTicks, ticks - 1) })}>
        {Array.from({ length: Math.min(256, view.score.measures.length + 1) }, (_, index) => <option key={index} value={index}>{index + 1}{index === view.score.measures.length ? " · next bar" : ""}</option>)}
      </select></label>
      <label>Beat<select aria-label="Insertion beat" value={view.position.offsetTicks} disabled={!view.writable}
        onChange={event => model.selectPosition({ ...view.position, offsetTicks: Number(event.target.value) })}>
        {offsets.map(offset => <option key={offset} value={offset}>{beatLabel(offset, view.score)}</option>)}
      </select></label>
      <button className="secondary" disabled={!view.writable || !!view.selectedId || !!view.pending} onClick={() => { model.pause(); setManual(!manual); }}>Add chord by hand</button>

    </div>}
    {view.notice && !/^(Chord added|Note added|Melody changed|Rest added|.* inserted\. Ready)/.test(view.notice) && <p role="status" className="entry-notice">{view.notice}</p>}
    {view.lane === "chords" && <div className="actions"><button className="secondary" disabled={!view.writable || !!view.pending || view.score.measures.length >= 256} onClick={() => model.addBar()}>+ Bar</button>
      {view.position.measureIndex < view.score.measures.length && <>
        <button className="text-button" disabled={!view.writable || !!view.pending || view.score.measures.length >= 256} onClick={() => model.addBar(view.position.measureIndex)}>+ Before</button>
        <button className="text-button" disabled={!view.writable || !!view.pending || view.score.measures.length >= 256} onClick={() => model.addBar(view.position.measureIndex + 1)}>+ After</button>
      </>}
      {view.selectedId && <button className="text-button" onClick={() => { model.selectPosition(view.position); setManual(view.lane === "chords"); }}>Continue here</button>}
    </div>}
    {view.lane === "chords" && ((view.selectedId || view.pending) ? <ChordForm key={formKey} model={model} view={view} />
      : manual && <ChordForm key={view.lane} model={model} view={view} manual close={() => setManual(false)} />)}
    {view.pending?.lane === "melody" && <div className="actions">
      <button disabled={!view.writable} onClick={() => { if (view.pending?.lane === "melody") model.applyPendingMelody(view.pending.spec); }}>Retry capture</button>
      <button disabled={!view.writable} onClick={() => model.discardPending()}>Discard capture</button>
    </div>}
  </section>;
}
