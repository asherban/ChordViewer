import { useState, type FormEvent } from "react";
import { CHORD_DURATIONS, MELODY_DURATIONS, findChord, findMelody, measureTicks, type MelodySpec, type NoteDuration, type Pitch } from "@chordviewer/contracts";
import { ScoreDraft, type DraftSnapshot } from "./ScoreDraft";
import { beatLabel, durationLabel, durationValue, melodyLabel } from "../score/labels";

function chordDurations(view: DraftSnapshot) { return [...new Set([...CHORD_DURATIONS, measureTicks(view.score), view.duration])].sort((a, b) => a - b); }
const chordDurationLabel = (ticks: number, view: DraftSnapshot) => ticks === measureTicks(view.score) ? "Whole bar" : `${ticks * view.score.timeSignature.denominator / 1920} beats`;
function readDuration(value: string): NoteDuration { const [denominator, dots] = value.split(":").map(Number); return { denominator: denominator as NoteDuration["denominator"], dots: dots as 0 | 1 }; }

function DurationSelect({ value, onChange, label, disabled }: { value: NoteDuration; onChange: (value: NoteDuration) => void; label: string; disabled: boolean }) {
  return <label>{label}<select aria-label={label} value={durationValue(value)} disabled={disabled} onChange={event => onChange(readDuration(event.target.value))}>
    {MELODY_DURATIONS.map(duration => <option key={durationValue(duration)} value={durationValue(duration)}>{durationLabel(duration)}</option>)}
  </select></label>;
}

function ChordForm({ model, view, manual, close }: { model: ScoreDraft; view: DraftSnapshot; manual?: boolean; close?: () => void }) {
  const selected = !view.pending && view.selectedId ? findChord(view.score, view.selectedId)?.event : null;
  const [symbol, setSymbol] = useState(selected?.symbol ?? view.alternatives[0] ?? "");
  const [duration, setDuration] = useState(selected?.durationTicks ?? view.duration);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (manual) { if (model.addChord(symbol)) close?.(); }
    else if (selected) model.changeSelected(symbol, duration);
    else model.applyPending(symbol);
  }
  return <form className="chord-correction" aria-label={manual ? "Add chord" : selected ? "Change chord" : "Captured chord"} onSubmit={submit}
    onFocusCapture={event => { if (event.target.matches("input,select")) model.pause(); }}>
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
      </> : manual ? <button type="button" className="secondary" onClick={close}>Cancel</button>
        : <button type="button" className="secondary" onClick={() => model.discardPending()}>Discard capture</button>}
    </div>
  </form>;
}

function MelodyForm({ model, view, manual, close }: { model: ScoreDraft; view: DraftSnapshot; manual?: boolean; close?: () => void }) {
  const selected = !view.pending && view.selectedId ? findMelody(view.score, view.selectedId)?.event : null;
  const pending = view.pending?.lane === "melody" ? view.pending : null;
  const initial = selected ?? pending?.spec;
  const [kind, setKind] = useState<"note" | "rest">(initial?.kind ?? "note");
  const [pitch, setPitch] = useState<Pitch>(initial?.kind === "note" ? initial.pitch : { step: "C", alter: 0, octave: 4 });
  const [localDuration, setDuration] = useState(initial?.duration ?? view.melodyDuration);
  const [tie, setTie] = useState(selected?.kind === "note" && !!selected.tieToNext);
  const [tieChanged, setTieChanged] = useState(false);
  const duration = pending?.spec.duration ?? localDuration;
  function submit(event: FormEvent) {
    event.preventDefault();
    const spec: MelodySpec = kind === "note" ? { kind, pitch, duration } : { kind, duration };
    if (manual) { if (model.addMelody(spec)) close?.(); }
    else if (pending) model.applyPendingMelody(spec);
    else model.changeMelody(spec, tieChanged ? tie : undefined);
  }
  return <form className="chord-correction" aria-label={manual ? "Add melody" : pending ? "Captured melody" : "Change melody"} onSubmit={submit}
    onFocusCapture={event => { if (event.target.matches("input,select")) model.pause(); }}>
    <div className="melody-fields">
      <label>Event<select aria-label="Melody event type" value={kind} disabled={!view.writable} onChange={event => setKind(event.target.value as "note" | "rest")}>
        <option value="note">Note</option><option value="rest">Rest</option>
      </select></label>
      {kind === "note" && <>
        <label>Pitch<select aria-label="Note pitch" value={pitch.step} disabled={!view.writable} onChange={event => setPitch({ ...pitch, step: event.target.value as Pitch["step"] })}>
          {[..."CDEFGAB"].map(step => <option key={step}>{step}</option>)}
        </select></label>
        <label>Accidental<select aria-label="Note accidental" value={pitch.alter} disabled={!view.writable} onChange={event => setPitch({ ...pitch, alter: Number(event.target.value) as Pitch["alter"] })}>
          <option value={-1}>♭ Flat</option><option value={0}>♮ Natural</option><option value={1}>♯ Sharp</option>
        </select></label>
        <label>Octave<select aria-label="Note octave" value={pitch.octave} disabled={!view.writable} onChange={event => setPitch({ ...pitch, octave: Number(event.target.value) as Pitch["octave"] })}>
          {[3, 4, 5, 6].map(octave => <option key={octave}>{octave}</option>)}
        </select></label>
      </>}
      <DurationSelect label="Note duration" value={duration} disabled={!view.writable} onChange={value => pending ? model.setMelodyDuration(value) : setDuration(value)} />
    </div>
    {selected && kind === "note" && <label className="choice tie-choice"><input type="checkbox" checked={tie} disabled={!view.writable}
      onChange={event => { setTie(event.target.checked); setTieChanged(true); }} /> Tie to next note <span className="small">The following note must be adjacent and have the same pitch.</span></label>}
    <div className="actions">
      <button className="primary" disabled={!view.writable}>{manual ? "Add melody event" : pending ? "Insert captured note" : "Apply melody changes"}</button>
      {selected ? <>
        <button type="button" className="secondary" disabled={!view.canCapture} onClick={() => model.arm(true)}>Replace from MIDI</button>
        <button type="button" className="secondary danger" disabled={!view.writable || selected.kind === "rest"} onClick={model.deleteSelected}>Delete note → rest</button>
      </> : manual ? <button type="button" className="secondary" onClick={close}>Cancel</button>
        : <button type="button" className="secondary" onClick={() => model.discardPending()}>Discard capture</button>}
    </div>
  </form>;
}

export function ScoreEntryControls({ model, view }: { model: ScoreDraft; view: DraftSnapshot }) {
  const [manual, setManual] = useState(false);
  const ticks = measureTicks(view.score);
  const offsets = [...new Set([...Array.from({ length: ticks / 60 }, (_, index) => index * 60), view.position.offsetTicks])].sort((a, b) => a - b);
  const selected = view.selectedId ? view.lane === "chords" ? findChord(view.score, view.selectedId)?.event : findMelody(view.score, view.selectedId)?.event : null;
  const formKey = view.pending ? `pending:${view.pending.lane}:${view.pending.notes.join(",")}` : `${view.lane}:${view.selectedId}:${JSON.stringify(selected)}`;
  return <section className="entry-controls" aria-label="Score entry">
    <div className="entry-control-row">
      <div className="segmented entry-pass" aria-label="Entry pass">
        <button aria-pressed={view.lane === "chords"} disabled={!view.writable} onClick={() => { setManual(false); model.setLane("chords"); }}>Chord entry</button>
        <button aria-pressed={view.lane === "melody"} disabled={!view.writable} onClick={() => { setManual(false); model.setLane("melody"); }}>Melody entry</button>
      </div>
      <span className={view.entry === "paused" ? "entry-badge" : "entry-badge armed"}>
        {view.entry === "paused" ? "Entry paused" : view.entry === "replace" ? "Replacing selection" : "MIDI entry on"}
      </span>
      {view.entry === "paused" ? <button className="primary" disabled={!view.canCapture || !!view.selectedId || !!view.pending || manual} onClick={() => model.arm()}>Start MIDI entry</button>
        : <button className="primary" onClick={model.pause}>Pause entry</button>}
      <button className="secondary" disabled={!view.writable || !view.undoCount} onClick={() => { setManual(false); model.undo(); }}>Undo</button>
      <button className="secondary" disabled={!view.writable || !view.redoCount} onClick={() => { setManual(false); model.redo(); }}>Redo</button>
    </div>
    <div className="entry-target-row">
      {view.lane === "chords" ? <label>New chord duration<select aria-label="New chord duration" disabled={!view.writable} value={view.duration} onChange={event => model.setDuration(Number(event.target.value))}>
        {chordDurations(view).map(duration => <option value={duration} key={duration}>{chordDurationLabel(duration, view)}</option>)}
      </select></label> : <DurationSelect label="New note duration" value={view.melodyDuration} disabled={!view.writable} onChange={value => model.setMelodyDuration(value)} />}
      <label>Bar<select aria-label="Insertion bar" value={Math.min(view.position.measureIndex, 255)} disabled={!view.writable}
        onChange={event => model.selectPosition({ measureIndex: Number(event.target.value), offsetTicks: Math.min(view.position.offsetTicks, ticks - 1) })}>
        {Array.from({ length: Math.min(256, view.score.measures.length + 1) }, (_, index) => <option key={index} value={index}>{index + 1}{index === view.score.measures.length ? " · next bar" : ""}</option>)}
      </select></label>
      <label>Beat<select aria-label="Insertion beat" value={view.position.offsetTicks} disabled={!view.writable}
        onChange={event => model.selectPosition({ ...view.position, offsetTicks: Number(event.target.value) })}>
        {offsets.map(offset => <option key={offset} value={offset}>{beatLabel(offset, view.score)}</option>)}
      </select></label>
      <button className="secondary" disabled={!view.writable || !!view.selectedId || !!view.pending} onClick={() => { model.pause(); setManual(!manual); }}>{view.lane === "chords" ? "Add chord by hand" : "Add note by hand"}</button>
      {view.lane === "melody" && <button className="secondary" disabled={!view.writable || !!view.selectedId || !!view.pending}
        onClick={() => { setManual(false); model.addMelody({ kind: "rest", duration: view.melodyDuration }); }}>Insert rest</button>}
    </div>
    <p role="status" className="entry-notice">{view.notice}</p>
    {view.lane === "melody" && !!view.score.measures[view.position.measureIndex]?.melody.length && <label className="event-picker">Change an event in this bar
      <select aria-label="Melody event in selected bar" value={view.selectedId ?? ""} disabled={!view.writable} onChange={event => { if (event.target.value) { setManual(false); model.selectMelody(event.target.value); } }}>
        <option value="">Select a note or rest</option>
        {view.score.measures[view.position.measureIndex].melody.map(event => <option key={event.id} value={event.id}>Beat {beatLabel(event.offsetTicks, view.score)} · {melodyLabel(event)}</option>)}
      </select>
    </label>}
    {(view.selectedId || view.pending) ? view.lane === "chords" ? <ChordForm key={formKey} model={model} view={view} /> : <MelodyForm key={formKey} model={model} view={view} />
      : manual && (view.lane === "chords" ? <ChordForm key={view.lane} model={model} view={view} manual close={() => setManual(false)} /> : <MelodyForm key={view.lane} model={model} view={view} manual close={() => setManual(false)} />)}
    {!view.selectedId && !view.pending && view.lastEventId && <button className="text-button" disabled={!view.writable} onClick={() => {
      setManual(false); if (view.lane === "chords") model.selectChord(view.lastEventId!); else model.selectMelody(view.lastEventId!);
    }}>{view.lane === "chords" ? "Change the last chord or choose another name" : "Change the last note or rest"}</button>}
  </section>;
}
