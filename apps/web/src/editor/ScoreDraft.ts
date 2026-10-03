import {
  ChordCapture, CHORD_DURATIONS, deleteChord, findChord, recognizeChord, writeChord,
  deleteMelodyAndShift, melodyGroup, findMelody, writeMelody, insertBar, setMelodyTie, midiToPitch, nextMelodyPosition, changeMelodyAndShift,
  changeScoreSettings, measureTicks, durationTicks, type ChordPosition, type LeadSheet, type NoteDuration, type MelodySpec,
  type KeySignature, type Pitch, trimTrailingSilentBars,
} from "@chordviewer/contracts";
import type { SavedSheet } from "../library/api";
import type { MidiInputEvent } from "../midi/useMidiInput";

export type EntryLane = "chords" | "melody";
type Point = { score: LeadSheet; position: ChordPosition; lane: EntryLane; duration: number; melodyDuration: NoteDuration; lanePositions: Record<EntryLane, ChordPosition> };
type PendingBase = { notes: number[]; position: ChordPosition; replaceId: string | null };
type Pending = PendingBase & ({ lane: "chords"; duration: number } | { lane: "melody"; spec: MelodySpec; ticks?: number });
export type DraftSnapshot = Omit<Point, "lanePositions"> & {
  title: string; tutorial: string; dirty: boolean; selectedId: string | null;
  entry: "paused" | "insert" | "replace"; duration: number; melodyDuration: NoteDuration; notice: string;
  pending: Pending | null; alternatives: string[]; lastEventId: string | null;
  pinnedChords: string[];
  undoCount: number; redoCount: number; writable: boolean; canCapture: boolean;
};

/** One history and capture gate for both lanes; MIDI writes synchronously between renders. */
export class ScoreDraft {
  private view: DraftSnapshot;
  private baseline: string;
  private saved: SavedSheet | null;
  private readonly capture = new ChordCapture();
  private readonly listeners = new Set<() => void>();
  private past: Point[] = [];
  private future: Point[] = [];
  private gate = false;
  private gestureDuration: { chord: number; melody: NoteDuration } | null = null;
  private lanePositions: Record<EntryLane, ChordPosition> = { chords: { measureIndex: 0, offsetTicks: 0 }, melody: { measureIndex: 0, offsetTicks: 0 } };
  constructor(score: LeadSheet, saved: SavedSheet | null, private readonly id: () => string = () => crypto.randomUUID()) {
    this.saved = saved;
    this.view = { score, position: { measureIndex: 0, offsetTicks: 0 }, lane: "chords", title: score.title,
      tutorial: saved?.tutorialUrl ?? "", dirty: false, selectedId: null, entry: "paused", duration: measureTicks(score),
      melodyDuration: { denominator: 4, dots: 0 }, notice: "Choose a position, then start MIDI entry or add a chord by hand.",
      pending: null, alternatives: [], lastEventId: null, pinnedChords: [], undoCount: 0, redoCount: 0, writable: false, canCapture: false };
    this.baseline = this.content();
    this.update({ score: trimTrailingSilentBars(score) });
  }
  getSnapshot = () => this.view;
  getSavedBase = () => this.saved;
  restoreDraft(score: LeadSheet, title: string, tutorial: string, position: ChordPosition) {
    if (!this.saved || score.id !== this.saved.id) throw new Error("Recovery belongs to another sheet.");
    this.cancel(); this.past = []; this.future = [];
    this.lanePositions = { chords: { measureIndex: 0, offsetTicks: 0 }, melody: { measureIndex: 0, offsetTicks: 0 } };
    this.update({ score, title, tutorial, lane: "chords", duration: measureTicks(score), melodyDuration: { denominator: 4, dots: 0 },
      entry: "paused", pending: null, selectedId: null, lastEventId: null,
      alternatives: [], notice: "Recovered local draft. Review it, then save explicitly." });
    this.restorePosition(position);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private music(score: LeadSheet) {
    // Persistence may reorder JSON object keys without changing any music.
    return JSON.stringify([score.schemaVersion, score.keySignature, score.timeSignature.numerator, score.timeSignature.denominator,
      trimTrailingSilentBars(score).measures.map(m => [m.id, m.chords.map(e => [e.id, e.offsetTicks, e.durationTicks, e.symbol]),
        m.melody.map(e => [e.id, e.offsetTicks, e.kind, e.duration.denominator, e.duration.dots,
          ...(e.kind === "note" ? [e.pitch.step, e.pitch.alter, e.pitch.octave, !!e.tieToNext] : [])])])]);
  }
  private content() { return JSON.stringify([this.music(this.view.score), this.view.title, this.view.tutorial]); }
  private point(): Point { return { score: this.view.score, position: this.view.position, lane: this.view.lane, duration: this.view.duration, melodyDuration: this.view.melodyDuration, lanePositions: { ...this.lanePositions } }; }
  private update(patch: Partial<DraftSnapshot>) {
    this.view = { ...this.view, ...patch, undoCount: this.past.length, redoCount: this.future.length };
    const score = this.view.score;
    const clamp = (p: ChordPosition) => p.measureIndex > score.measures.length
      ? { measureIndex: score.measures.length, offsetTicks: 0 } : p;
    const exists = (id: string | null) => id && score.measures.some(m => [...m.chords, ...m.melody].some(e => e.id === id)) ? id : null;
    this.view = { ...this.view, position: clamp(this.view.position), selectedId: exists(this.view.selectedId), lastEventId: exists(this.view.lastEventId) };
    this.lanePositions = { chords: clamp(this.lanePositions.chords), melody: clamp(this.lanePositions.melody) };
    this.lanePositions[this.view.lane] = this.view.position;
    this.view = { ...this.view, dirty: this.content() !== this.baseline };
    for (const listener of this.listeners) listener();
  }
  private cancel() { this.capture.setEnabled(false); }
  configure(writable: boolean, connected: boolean, blocked: boolean) {
    const canCapture = writable && connected && !blocked;
    this.gate = canCapture;
    if (this.view.writable === writable && this.view.canCapture === canCapture) return;
    if (!canCapture) this.cancel();
    this.update({ writable, canCapture, ...(!canCapture ? { entry: "paused" as const } : {}) });
  }
  acceptSaved(saved: SavedSheet | null, metadataOnly = false) {
    if (!saved || saved === this.saved) return;
    if (metadataOnly && this.saved?.id === saved.id) {
      // Library-only metadata advances the guarded revision without touching the local music,
      // details, undo history or dirty baseline.
      this.saved = saved;
      // Recovery also observes the saved base, even while the editor is inactive.
      for (const listener of this.listeners) listener();
      return;
    }
    this.saved = saved;
    this.cancel();
    const sameMusic = this.music(saved.score) === this.music(this.view.score);
    if (!sameMusic) { this.past = []; this.future = []; this.lanePositions = { chords: { measureIndex: 0, offsetTicks: 0 }, melody: { measureIndex: 0, offsetTicks: 0 } }; }
    this.view = { ...this.view, score: saved.score, title: saved.score.title, tutorial: saved.tutorialUrl ?? "",
      ...(!sameMusic ? { position: { measureIndex: 0, offsetTicks: 0 }, selectedId: null, lastEventId: null, alternatives: [] } : {}),
      entry: "paused", pending: null };
    this.baseline = this.content();
    this.update({ score: trimTrailingSilentBars(saved.score), notice: "" });
  }
  details(title: string, tutorial: string) { this.pause(); this.update({ title, tutorial }); }
  restorePosition(position: ChordPosition) {
    if (this.view.pending) return;
    const bar = Math.max(0, Math.min(this.view.score.measures.length, 255, Math.trunc(position.measureIndex)));
    const offsetTicks = Math.max(0, Math.min(measureTicks(this.view.score) - 1, Math.trunc(position.offsetTicks)));
    if (!Number.isFinite(bar) || !Number.isFinite(offsetTicks)) return;
    this.cancel();
    this.update({ position: { measureIndex: bar, offsetTicks }, selectedId: null, entry: "paused" });
  }
  pause = () => { this.cancel(); this.update({ entry: "paused" }); };
  togglePinnedChord(symbol: string) {
    const chord = symbol.trim();
    if (!this.view.writable || !chord || [...chord].length > 32) return;
    this.update({ pinnedChords: this.view.pinnedChords.includes(chord) ? this.view.pinnedChords.filter(p => p !== chord) : [chord, ...this.view.pinnedChords].slice(0, 8) });
  }
  setLane(lane: EntryLane) {
    if (!this.view.writable || lane === this.view.lane) return;
    if (this.view.pending) { this.update({ notice: "Apply or discard your captured input before changing passes." }); return; }
    this.cancel();
    const remembered = this.lanePositions[lane];
    const position = lane === "melody" ? nextMelodyPosition(this.view.score) : { measureIndex: Math.min(remembered.measureIndex, this.view.score.measures.length), offsetTicks: Math.min(remembered.offsetTicks, measureTicks(this.view.score) - 1) };
    this.update({ lane, position, selectedId: null, pending: null, alternatives: [], lastEventId: null, entry: "paused",
      notice: "" });
  }
  setDuration(duration: number) {
    if (!this.view.writable || (!(CHORD_DURATIONS as readonly number[]).includes(duration) && duration !== measureTicks(this.view.score))) return;
    this.update({ duration, pending: this.view.pending?.lane === "chords" ? { ...this.view.pending, duration } : this.view.pending });
  }
  setMelodyDuration(duration: NoteDuration) {
    if (!this.view.writable || ![1, 2, 4, 8, 16, 32].includes(duration.denominator) || ![0, 1].includes(duration.dots) || (duration.denominator === 32 && duration.dots !== 0)) return;
    this.update({ melodyDuration: this.view.pending?.replaceId ? this.view.melodyDuration : duration, pending: this.view.pending?.lane === "melody"
      ? { ...this.view.pending, spec: { ...this.view.pending.spec, duration }, ticks: durationTicks(duration) } : this.view.pending });
  }
  selectPosition(position: ChordPosition) {
    if (!this.view.writable || !Number.isInteger(position.measureIndex) || position.measureIndex < 0 ||
      position.measureIndex > this.view.score.measures.length || position.measureIndex >= 256 ||
      !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= measureTicks(this.view.score)) return;
    this.cancel();
    this.update({ position, selectedId: null, entry: "paused",
      pending: this.view.pending ? { ...this.view.pending, position, replaceId: null } : null,
      alternatives: this.view.pending ? this.view.alternatives : [],
      notice: this.view.pending ? "Captured input moved here. Apply it when ready." : "Position selected. Add by hand or start MIDI entry." });
  }
  selectChord(id: string) {
    if (!this.view.writable) return;
    if (this.view.pending) { this.update({ notice: "Apply or discard your captured input before selecting another event." }); return; }
    const found = findChord(this.view.score, id);
    if (!found) return;
    this.cancel();
    this.update({ lane: "chords", selectedId: id, position: found.position, duration: found.event.durationTicks, entry: "paused", pending: null,
      alternatives: id === this.view.lastEventId ? this.view.alternatives : [], notice: "Entry paused while you change this chord." });
  }
  selectMelody(id: string) {
    if (!this.view.writable) return;
    if (this.view.pending) { this.update({ notice: "Apply or discard your captured input before selecting another event." }); return; }
    const found = melodyGroup(this.view.score, id);
    if (!found) return;
    this.cancel();
    this.update({ lane: "melody", selectedId: found.event.id, position: found.position,
      entry: "paused", pending: null, alternatives: [], notice: "" });
  }
  arm(replace = false) {
    if (!this.gate || this.view.pending) return;
    if (replace && !this.view.selectedId) return;
    if (!replace && this.view.selectedId) {
      this.update({ notice: "Choose an empty position, or use Replace from MIDI for this selection." }); return;
    }
    this.capture.setEnabled(true);
    this.update({ entry: replace ? "replace" : "insert", pending: null,
      notice: replace ? "Play the replacement, then release all keys. Only this selection will change."
        : "Entry on. Release all keys to insert; sustain does not delay insertion." });
  }
  receive = (event: MidiInputEvent) => {
    if (event.type === "reset") {
      this.capture.reset(event.held);
      this.update({ entry: "paused", notice: "MIDI input reset. Release the keys, then start entry again." });
      return;
    }
    if (this.capture.enabled && !this.capture.heldIds.length && (event.data[0]! & 0xf0) === 0x90 && event.data[2]! > 0)
      this.gestureDuration = { chord: this.chordTicks(), melody: this.view.entry === "replace" && this.view.selectedId ? findMelody(this.view.score, this.view.selectedId)?.event.duration ?? this.view.melodyDuration : this.view.melodyDuration };
    const notes = this.capture.receive(event.data);
    if (!notes || !this.gate || this.view.entry === "paused") return;
    const base = { notes, position: this.view.position, replaceId: this.view.entry === "replace" ? this.view.selectedId : null };
    if (this.view.lane === "melody") {
      if (notes.length !== 1) {
        this.cancel();
        this.update({ entry: "paused", notice: "Melody needs one note at a time. Release overlapping notes, then start entry again." }); return;
      }
      try {
        const spec: MelodySpec = { kind: "note", pitch: midiToPitch(notes[0], this.view.score.keySignature), duration: this.gestureDuration?.melody ?? this.view.melodyDuration };
        this.commitMelodyCapture({ ...base, lane: "melody", spec, ticks: base.replaceId ? melodyGroup(this.view.score, base.replaceId)?.ticks : undefined });
      } catch (error) { this.problem(error); }
      return;
    }
    const recognition = recognizeChord(notes);
    if (recognition.pitchClasses.length < 2) { this.update({ notice: "Play at least two different pitches for a chord, or switch to the melody pass." }); return; }
    const alternatives = recognition.candidates.map(item => item.symbol);
    const pending: Pending = { ...base, lane: "chords", duration: this.gestureDuration?.chord ?? this.chordTicks() };
    if (!alternatives.length) {
      this.cancel();
      this.update({ entry: "paused", pending, alternatives: [], notice: "Chord not recognized. Enter its symbol below, or discard this capture." });
    } else this.commitChordCapture(pending, alternatives[0], alternatives);
  };
  private record(score: LeadSheet, position: ChordPosition, extra: Partial<DraftSnapshot>, minimumBars = 1) {
    this.past = [...this.past.slice(-99), this.point()];
    this.future = [];
    this.update({ score: trimTrailingSilentBars(score, minimumBars), position, pending: null, ...extra });
  }
  private problem(error: unknown) {
    this.cancel();
    this.update({ entry: "paused", notice: error instanceof Error ? error.message : "Could not change the score." });
  }
  private commitChordCapture(pending: Pending & { lane: "chords" }, symbol: string, alternatives: string[]) {
    try {
      const result = writeChord(this.view.score, pending.position, symbol, pending.duration, this.id, pending.replaceId ?? undefined);
      if (pending.replaceId) this.cancel();
      this.record(result.score, result.position, { selectedId: null, lastEventId: result.eventId, alternatives,
        ...(pending.replaceId ? { entry: "paused" as const } : {}), notice: pending.replaceId ? "Chord replaced. Entry paused." : `${symbol} inserted. Ready for the next chord.` });
    } catch (error) { this.problem(error); this.update({ pending, alternatives }); }
  }
  private commitMelodyCapture(pending: Pending & { lane: "melody" }) {
    try {
      const result = pending.replaceId ? changeMelodyAndShift(this.view.score, pending.replaceId, pending.spec, this.id, pending.ticks ?? durationTicks(pending.spec.duration))
        : writeMelody(this.view.score, nextMelodyPosition(this.view.score), pending.spec, this.id);
      if (pending.replaceId) this.cancel();
      this.record(result.score, result.position, { selectedId: null, lastEventId: result.eventId, alternatives: [],
        ...(pending.replaceId ? { entry: "paused" as const } : {}), notice: pending.replaceId ? "Melody replaced. Entry paused." : "Note inserted. Ready for the next note." });
    } catch (error) { this.problem(error); this.update({ pending }); }
  }
  applyPending(symbol: string) {
    if (this.view.writable && this.view.pending?.lane === "chords") this.commitChordCapture(this.view.pending, symbol.trim(), this.view.alternatives);
  }
  applyPendingMelody(spec: MelodySpec) {
    if (this.view.writable && this.view.pending?.lane === "melody") this.commitMelodyCapture({ ...this.view.pending, spec, ticks: durationTicks(spec.duration) });
  }
  discardPending() { this.update({ pending: null, notice: "Capture discarded. Your score is unchanged." }); }
  addChord(symbol: string) {
    if (!this.view.writable) return false;
    this.cancel();
    try {
      const result = writeChord(this.view.score, this.view.position, symbol.trim(), this.chordTicks(), this.id);
      this.record(result.score, result.position, { entry: "paused", lane: "chords", selectedId: null, lastEventId: result.eventId, alternatives: [], notice: "Chord added." });
      return true;
    } catch (error) { this.problem(error); return false; }
  }
  addMelody(spec: MelodySpec) {
    if (!this.view.writable) return false;
    this.cancel();
    try {
      const result = writeMelody(this.view.score, nextMelodyPosition(this.view.score), spec, this.id);
      this.record(result.score, result.position, { entry: "paused", lane: "melody", selectedId: null, lastEventId: result.eventId,
        melodyDuration: spec.duration, alternatives: [], notice: spec.kind === "rest" ? "Rest added." : "Note added." },
        spec.kind === "rest" ? result.position.measureIndex + (result.position.offsetTicks > 0 ? 1 : 0) : 1);
      return true;
    } catch (error) { this.problem(error); return false; }
  }
  changeSelected(symbol: string, duration: number) {
    if (!this.view.writable || !this.view.selectedId || this.view.lane !== "chords") return;
    this.cancel();
    try {
      const result = writeChord(this.view.score, this.view.position, symbol.trim(), duration, this.id, this.view.selectedId);
      this.record(result.score, this.view.position, { entry: "paused", duration, notice: "Chord changed." });
    } catch (error) { this.problem(error); }
  }
  changeMelody(spec: MelodySpec, tie?: boolean, ticks = durationTicks(spec.duration)) {
    if (!this.view.writable || !this.view.selectedId || this.view.lane !== "melody") return;
    this.cancel();
    try {
      const result = changeMelodyAndShift(this.view.score, this.view.selectedId, spec, this.id, ticks);
      const score = spec.kind === "note" && tie !== undefined ? setMelodyTie(result.score, result.eventId, tie) : result.score;
      this.record(score, this.view.position, { entry: "paused", notice: "" });
    } catch (error) { this.problem(error); }
  }
  private chordTicks() { return this.view.duration === measureTicks(this.view.score) ? measureTicks(this.view.score) - this.view.position.offsetTicks : this.view.duration; }
  placeNote(position: ChordPosition, pitch: Pitch, eventId?: string) {
    if (!this.view.writable || this.view.pending) return;
    this.cancel();
    const original = eventId ? melodyGroup(this.view.score, eventId) : null;
    const spec: MelodySpec = { kind: "note", pitch, duration: original?.event.duration ?? this.view.melodyDuration };
    try {
      if (eventId && !original) throw new Error("This note no longer exists.");
      if (original?.event.kind === "note" && JSON.stringify(original.event.pitch) === JSON.stringify(pitch)) { this.selectMelody(eventId!); return; }
      const result = eventId ? changeMelodyAndShift(this.view.score, eventId, spec, this.id, original!.ticks)
        : writeMelody(this.view.score, nextMelodyPosition(this.view.score), spec, this.id);
      this.record(result.score, eventId ? original!.position : result.position, { lane: "melody", entry: "paused", selectedId: eventId ? result.eventId : null, lastEventId: result.eventId, notice: "" });
    } catch (error) {
      this.problem(error);
      this.update({ pending: { lane: "melody", notes: [], spec, position: original?.position ?? position, replaceId: eventId ?? null, ticks: original?.ticks } });
    }
  }
  noteDuration(duration: NoteDuration) {
    if (this.view.pending?.lane === "melody") { this.setMelodyDuration(duration); return; }
    const group = this.view.selectedId ? melodyGroup(this.view.score, this.view.selectedId) : null;
    const note = group?.event;
    if (!note) { this.setMelodyDuration(duration); return; }
    if (durationTicks(duration) === group?.ticks) return;
    this.changeMelody(note.kind === "note" ? { kind: "note", pitch: note.pitch, duration } : { kind: "rest", duration });
  }
  resumeMelodyEntry() {
    if (!this.view.writable || this.view.pending) return;
    this.cancel();
    this.update({ lane: "melody", position: nextMelodyPosition(this.view.score), selectedId: null, entry: "paused", notice: "" });
  }
  enterRest() {
    const selected = this.view.lane === "melody" && this.view.selectedId ? melodyGroup(this.view.score, this.view.selectedId) : null;
    if (selected) this.changeMelody({ kind: "rest", duration: selected.event.duration }, undefined, selected.ticks);
    else this.addMelody({ kind: "rest", duration: this.view.melodyDuration });
  }
  setTie(enabled: boolean) {
    if (!this.view.writable || this.view.pending) return;
    this.cancel();
    const event = this.view.selectedId ? findMelody(this.view.score, this.view.selectedId)?.event : null;
    if (event?.kind === "note") {
      try { const group = melodyGroup(this.view.score, event.id)!;
        const score = setMelodyTie(this.view.score, enabled ? group.ids.at(-1)! : group.event.id, enabled);
        this.record(score, group.position, { entry: "paused", notice: "" });
      } catch (error) { this.problem(error); }
    }
  }
  addBar(index = this.view.score.measures.length) {
    if (!this.view.writable || this.view.pending) return;
    this.cancel();
    try {
      const score = insertBar(this.view.score, index, this.id);
      const remembered = { ...this.lanePositions };
      this.record(score, { measureIndex: index, offsetTicks: 0 }, { selectedId: null, entry: "paused", notice: "" }, score.measures.length);
      for (const lane of ["chords", "melody"] as const) if (lane !== this.view.lane && remembered[lane].measureIndex >= index)
        this.lanePositions[lane] = { ...remembered[lane], measureIndex: Math.min(remembered[lane].measureIndex + 1, score.measures.length) };
    } catch (error) { this.problem(error); }
  }
  moveChord(id: string, position: ChordPosition) {
    if (!this.view.writable || this.view.pending) return;
    this.cancel();
    try {
      const chord = findChord(this.view.score, id);
      if (!chord) throw new Error("This chord no longer exists.");
      if (JSON.stringify(position) === JSON.stringify(chord.position)) return;
      const result = writeChord(this.view.score, position, chord.event.symbol, chord.event.durationTicks, this.id, id);
      this.record(result.score, position, { selectedId: id, lane: "chords", entry: "paused", notice: "" });
    } catch (error) { this.problem(error); }
  }
  deleteSelected = () => {
    if (!this.view.writable || !this.view.selectedId) return;
    this.cancel();
    try {
      const score = this.view.lane === "chords" ? deleteChord(this.view.score, this.view.selectedId) : deleteMelodyAndShift(this.view.score, this.view.selectedId, this.id);
      this.record(score, this.view.position, { entry: "paused", selectedId: null, lastEventId: null, alternatives: [],
        notice: this.view.lane === "chords" ? "Chord deleted. The melody is unchanged." : "" });
    } catch (error) { this.problem(error); }
  };
  settings(key: KeySignature, time: LeadSheet["timeSignature"]) {
    if (!this.view.writable) return false;
    if (this.view.pending) { this.update({ notice: "Apply or discard your captured input before changing the key or meter." }); return false; }
    this.cancel();
    try {
      const score = changeScoreSettings(this.view.score, key, time);
      const ticks = measureTicks(score);
      const position = { ...this.view.position, offsetTicks: Math.min(this.view.position.offsetTicks, ticks - 60) };
      this.record(score, position, { entry: "paused", selectedId: null, pending: null, lastEventId: null, alternatives: [],
        duration: this.view.duration === measureTicks(this.view.score) ? ticks : Math.min(this.view.duration, ticks),
        notice: "Key and meter changed. Notes keep their written pitches and positions." });
      return true;
    } catch (error) { this.problem(error); return false; }
  }
  undo = () => this.history(false);
  redo = () => this.history(true);
  private history(redo: boolean) {
    if (!this.view.writable) return;
    const source = redo ? this.future : this.past;
    const point = source.at(-1);
    if (!point) return;
    this.cancel();
    const current = this.point();
    if (redo) { this.future = this.future.slice(0, -1); this.past = [...this.past.slice(-99), current]; }
    else { this.past = this.past.slice(0, -1); this.future = [...this.future.slice(-99), current]; }
    this.lanePositions = { ...point.lanePositions };
    this.update({ ...point, entry: "paused", pending: null, selectedId: null, alternatives: [], lastEventId: null,
      notice: redo ? "Change restored. Entry paused." : "Change undone and insertion position restored. Entry paused." });
  }
}
