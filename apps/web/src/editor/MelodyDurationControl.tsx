import { useRef, useState } from "react";
import { MELODY_DURATIONS, durationTicks, melodyGroup } from "@chordviewer/contracts";
import { durationLabel, pitchLabel } from "../score/labels";
import type { DraftSnapshot, ScoreDraft } from "./ScoreDraft";

const choices = [...MELODY_DURATIONS].sort((a, b) => durationTicks(a) - durationTicks(b));
export function MelodyDurationControl({ model, view }: { model: ScoreDraft; view: DraftSnapshot }) {
  const selected = !view.pending && view.selectedId ? melodyGroup(view.score, view.selectedId) : null;
  const duration = selected?.event.duration ?? (view.pending?.lane === "melody" ? view.pending.spec.duration : view.melodyDuration);
  return <DurationSlider key={`${view.selectedId}:${(selected?.ticks ?? durationTicks(duration))}` } model={model} view={view} totalTicks={selected?.ticks ?? durationTicks(duration)}
    label={selected ? `Selected ${selected.event.kind === "note" ? pitchLabel(selected.event.pitch) : "rest"}` : "Next note"} selected={!!selected} />;
}

function DurationSlider({ model, view, totalTicks, label, selected }: { model: ScoreDraft; view: DraftSnapshot; totalTicks: number; label: string; selected: boolean }) {
  const values = [...new Set([...choices.map(durationTicks), totalTicks])].sort((a, b) => a - b);
  const labelFor = (ticks: number) => { const value = choices.find(d => durationTicks(d) === ticks); return value ? durationLabel(value) : `${ticks / 480} beats`; };
  const commit = (ticks: number) => { const value = choices.find(d => durationTicks(d) === ticks); if (value) model.noteDuration(value); };
  const [preview, setPreview] = useState(totalTicks);
  const cancelled = useRef(false);
  return <section className="melody-duration" aria-label="Melody duration" onKeyDown={event => {
    if (event.key === "Escape") { cancelled.current = true; setPreview(totalTicks); }
  }}>
    <div className="duration-heading"><label htmlFor="stave-duration">{label}</label><output>{labelFor(preview)}</output></div>
    <input id="stave-duration" type="range" min={0} max={values.length - 1} step={1} value={values.indexOf(preview)}
      disabled={!view.writable} aria-label={selected ? "Selected note duration" : "New note duration"} aria-valuetext={labelFor(preview)}
      onPointerDown={() => { cancelled.current = false; }} onChange={event => { if (!cancelled.current) setPreview(values[Number(event.target.value)]); }}
      onPointerUp={event => { if (!cancelled.current) commit(values[Number(event.currentTarget.value)]); }}
      onPointerCancel={() => { cancelled.current = true; setPreview(totalTicks); }}
      onKeyDown={event => { if (event.key !== "Escape") cancelled.current = false; }}
      onKeyUp={event => { if (!cancelled.current && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) commit(preview); }} />
  </section>;
}
