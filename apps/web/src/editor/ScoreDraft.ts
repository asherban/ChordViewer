import {
  ChordCapture, CHORD_DURATIONS, deleteChord, findChord, insertChord, recognizeChord, replaceChord,
  deleteMelody, findMelody, insertMelody, replaceMelody, setMelodyTie, midiToPitch,
  changeScoreSettings, measureTicks, type ChordPosition, type LeadSheet, type NoteDuration, type MelodySpec,
  type KeySignature,
} from "@chordviewer/contracts";
import type { SavedSheet } from "../library/api";
import type { MidiInputEvent } from "../midi/useMidiInput";

export type EntryLane = "chords" | "melody";
type Point = { score: LeadSheet; position: ChordPosition; lane: EntryLane; duration: number; melodyDuration: NoteDuration };
type PendingBase = { notes: number[]; position: ChordPosition; replaceId: string | null };
type Pending = PendingBase & ({ lane: "chords"; duration: number } | { lane: "melody"; spec: MelodySpec });
export type DraftSnapshot = Point & {
  title: string; tutorial: string; dirty: boolean; selectedId: string | null;
  entry: "paused" | "insert" | "replace"; duration: number; melodyDuration: NoteDuration; notice: string;
  pending: Pending | null; alternatives: string[]; lastEventId: string | null;
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
  private lanePositions: Record<EntryLane, ChordPosition> = { chords: { measureIndex: 0, offsetTicks: 0 }, melody: { measureIndex: 0, offsetTicks: 0 } };
  constructor(score: LeadSheet, saved: SavedSheet | null, private readonly id: () => string = () => crypto.randomUUID()) {
    this.saved = saved;
    this.view = { score, position: { measureIndex: 0, offsetTicks: 0 }, lane: "chords", title: score.title,
      tutorial: saved?.tutorialUrl ?? "", dirty: false, selectedId: null, entry: "paused", duration: measureTicks(score),
      melodyDuration: { denominator: 4, dots: 0 }, notice: "Choose a position, then start MIDI entry or add a chord by hand.",
      pending: null, alternatives: [], lastEventId: null, undoCount: 0, redoCount: 0, writable: false, canCapture: false };
    this.baseline = this.content();
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
  private music(score: LeadSheet) { return JSON.stringify([score.schemaVersion, score.keySignature, score.timeSignature, score.measures]); }
  private content() { return JSON.stringify([this.music(this.view.score), this.view.title, this.view.tutorial]); }
  private point(): Point { return { score: this.view.score, position: this.view.position, lane: this.view.lane, duration: this.view.duration, melodyDuration: this.view.melodyDuration }; }
  private update(patch: Partial<DraftSnapshot>) {
    this.view = { ...this.view, ...patch, undoCount: this.past.length, redoCount: this.future.length };
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
    this.update({ notice: "Saved. Start MIDI entry when you are ready." });
  }
  details(title: string, tutorial: string) { this.pause(); this.update({ title, tutorial }); }
  restorePosition(position: ChordPosition) {
    if (this.view.pending) return;
    const bar = Math.max(0, Math.min(this.view.score.measures.length - 1, Math.trunc(position.measureIndex)));
    const offsetTicks = Math.max(0, Math.min(measureTicks(this.view.score) - 1, Math.trunc(position.offsetTicks)));
    if (!Number.isFinite(bar) || !Number.isFinite(offsetTicks)) return;
    this.cancel();
    this.update({ position: { measureIndex: bar, offsetTicks }, selectedId: null, entry: "paused" });
  }
  pause = () => { this.cancel(); this.update({ entry: "paused" }); };
  setLane(lane: EntryLane) {
    if (!this.view.writable || lane === this.view.lane) return;
    if (this.view.pending) { this.update({ notice: "Apply or discard your captured input before changing passes." }); return; }
    this.cancel();
    const remembered = this.lanePositions[lane];
    const position = { measureIndex: Math.min(remembered.measureIndex, this.view.score.measures.length), offsetTicks: Math.min(remembered.offsetTicks, measureTicks(this.view.score) - 1) };
    this.update({ lane, position, selectedId: null, pending: null, alternatives: [], lastEventId: null, entry: "paused",
      notice: lane === "melody" ? "Melody pass. Play one note at a time, or add a note or rest by hand." : "Chord pass. Your melody stays unchanged." });
  }
  setDuration(duration: number) {
    if (!this.view.writable || (!(CHORD_DURATIONS as readonly number[]).includes(duration) && duration !== measureTicks(this.view.score))) return;
    this.cancel();
    this.update({ duration, entry: "paused", pending: this.view.pending?.lane === "chords" ? { ...this.view.pending, duration } : this.view.pending,
      notice: this.view.pending ? "Duration changed for the captured chord. Apply it when ready." : "Duration changed. Start MIDI entry to continue." });
  }
  setMelodyDuration(duration: NoteDuration) {
    if (!this.view.writable || ![1, 2, 4, 8, 16].includes(duration.denominator) || ![0, 1].includes(duration.dots)) return;
    this.cancel();
    this.update({ melodyDuration: duration, entry: "paused", pending: this.view.pending?.lane === "melody"
      ? { ...this.view.pending, spec: { ...this.view.pending.spec, duration } } : this.view.pending,
      notice: "Duration changed. Apply your capture or start MIDI entry to continue." });
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
    const found = findMelody(this.view.score, id);
    if (!found) return;
    this.cancel();
    this.update({ lane: "melody", selectedId: id, position: found.position, melodyDuration: found.event.duration,
      entry: "paused", pending: null, alternatives: [], notice: "Entry paused while you change this note or rest." });
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
    const notes = this.capture.receive(event.data);
    if (!notes || !this.gate || this.view.entry === "paused") return;
    const base = { notes, position: this.view.position, replaceId: this.view.entry === "replace" ? this.view.selectedId : null };
    if (this.view.lane === "melody") {
      if (notes.length !== 1) {
        this.cancel();
        this.update({ entry: "paused", notice: "Melody needs one note at a time. Release overlapping notes, then start entry again." }); return;
      }
      try {
        const spec: MelodySpec = { kind: "note", pitch: midiToPitch(notes[0], this.view.score.keySignature), duration: this.view.melodyDuration };
        this.commitMelodyCapture({ ...base, lane: "melody", spec });
      } catch (error) { this.problem(error); }
      return;
    }
    const recognition = recognizeChord(notes);
    if (recognition.pitchClasses.length < 2) { this.update({ notice: "Play at least two different pitches for a chord, or switch to the melody pass." }); return; }
    const alternatives = recognition.candidates.map(item => item.symbol);
    const pending: Pending = { ...base, lane: "chords", duration: this.view.duration };
    if (!alternatives.length) {
      this.cancel();
      this.update({ entry: "paused", pending, alternatives: [], notice: "Chord not recognized. Enter its symbol below, or discard this capture." });
    } else this.commitChordCapture(pending, alternatives[0], alternatives);
  };
  private record(score: LeadSheet, position: ChordPosition, extra: Partial<DraftSnapshot>) {
    this.past = [...this.past.slice(-99), this.point()];
    this.future = [];
    this.update({ score, position, pending: null, ...extra });
  }
  private problem(error: unknown) {
    this.cancel();
    this.update({ entry: "paused", notice: error instanceof Error ? error.message : "Could not change the score." });
  }
  private commitChordCapture(pending: Pending & { lane: "chords" }, symbol: string, alternatives: string[]) {
    try {
      const result = pending.replaceId
        ? replaceChord(this.view.score, pending.replaceId, symbol, pending.duration)
        : insertChord(this.view.score, pending.position, symbol, pending.duration, this.id);
      if (pending.replaceId) this.cancel();
      this.record(result.score, result.position, { selectedId: null, lastEventId: result.eventId, alternatives,
        ...(pending.replaceId ? { entry: "paused" as const } : {}), notice: pending.replaceId ? "Chord replaced. Entry paused." : `${symbol} inserted. Ready for the next chord.` });
    } catch (error) { this.problem(error); this.update({ pending, alternatives }); }
  }
  private commitMelodyCapture(pending: Pending & { lane: "melody" }) {
    try {
      const result = pending.replaceId ? replaceMelody(this.view.score, pending.replaceId, pending.spec)
        : insertMelody(this.view.score, pending.position, pending.spec, this.id);
      if (pending.replaceId) this.cancel();
      this.record(result.score, result.position, { selectedId: null, lastEventId: result.eventId, alternatives: [],
        ...(pending.replaceId ? { entry: "paused" as const } : {}), notice: pending.replaceId ? "Melody replaced. Entry paused." : "Note inserted. Ready for the next note." });
    } catch (error) { this.problem(error); this.update({ pending }); }
  }
  applyPending(symbol: string) {
    if (this.view.writable && this.view.pending?.lane === "chords") this.commitChordCapture(this.view.pending, symbol.trim(), this.view.alternatives);
  }
  applyPendingMelody(spec: MelodySpec) {
    if (this.view.writable && this.view.pending?.lane === "melody") this.commitMelodyCapture({ ...this.view.pending, spec });
  }
  discardPending() { this.update({ pending: null, notice: "Capture discarded. Your score is unchanged." }); }
  addChord(symbol: string) {
    if (!this.view.writable) return false;
    this.cancel();
    try {
      const result = insertChord(this.view.score, this.view.position, symbol.trim(), this.view.duration, this.id);
      this.record(result.score, result.position, { entry: "paused", lane: "chords", selectedId: null, lastEventId: result.eventId, alternatives: [], notice: "Chord added." });
      return true;
    } catch (error) { this.problem(error); return false; }
  }
  addMelody(spec: MelodySpec) {
    if (!this.view.writable) return false;
    this.cancel();
    try {
      const result = insertMelody(this.view.score, this.view.position, spec, this.id);
      this.record(result.score, result.position, { entry: "paused", lane: "melody", selectedId: null, lastEventId: result.eventId,
        melodyDuration: spec.duration, alternatives: [], notice: spec.kind === "rest" ? "Rest added." : "Note added." });
      return true;
    } catch (error) { this.problem(error); return false; }
  }
  changeSelected(symbol: string, duration: number) {
    if (!this.view.writable || !this.view.selectedId || this.view.lane !== "chords") return;
    this.cancel();
    try {
      const result = replaceChord(this.view.score, this.view.selectedId, symbol.trim(), duration);
      this.record(result.score, this.view.position, { entry: "paused", duration, notice: "Chord changed." });
    } catch (error) { this.problem(error); }
  }
  changeMelody(spec: MelodySpec, tie?: boolean) {
    if (!this.view.writable || !this.view.selectedId || this.view.lane !== "melody") return;
    this.cancel();
    try {
      const result = replaceMelody(this.view.score, this.view.selectedId, spec);
      const score = spec.kind === "note" && tie !== undefined ? setMelodyTie(result.score, result.eventId, tie) : result.score;
      this.record(score, this.view.position, { entry: "paused", melodyDuration: spec.duration, notice: "Melody changed." });
    } catch (error) { this.problem(error); }
  }
  deleteSelected = () => {
    if (!this.view.writable || !this.view.selectedId) return;
    this.cancel();
    try {
      const score = this.view.lane === "chords" ? deleteChord(this.view.score, this.view.selectedId) : deleteMelody(this.view.score, this.view.selectedId);
      this.record(score, this.view.position, { entry: "paused", selectedId: null, lastEventId: null, alternatives: [],
        notice: this.view.lane === "chords" ? "Chord deleted. The melody is unchanged." : "Note replaced by an equal rest. The timeline is unchanged." });
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
    this.update({ ...point, entry: "paused", pending: null, selectedId: null, alternatives: [], lastEventId: null,
      notice: redo ? "Change restored. Entry paused." : "Change undone and insertion position restored. Entry paused." });
  }
}
