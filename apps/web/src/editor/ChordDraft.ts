import {
  ChordCapture, CHORD_DURATIONS, deleteChord, findChord, insertChord,
  recognizeChord, replaceChord, type ChordPosition, type LeadSheet,
} from "@chordviewer/contracts";
import type { SavedSheet } from "../library/api";
import type { MidiInputEvent } from "../midi/useMidiInput";

type Point = { score: LeadSheet; position: ChordPosition };
type Pending = { notes: number[]; position: ChordPosition; duration: number; replaceId: string | null };
export type DraftSnapshot = Point & {
  title: string; tutorial: string; dirty: boolean; selectedId: string | null;
  entry: "paused" | "insert" | "replace"; duration: number; notice: string;
  pending: Pending | null; alternatives: string[]; lastEventId: string | null;
  undoCount: number; redoCount: number; writable: boolean; canCapture: boolean;
};

/** MIDI mutates this store synchronously; React observes immutable snapshots. */
export class ChordDraft {
  private view: DraftSnapshot;
  private baseline: string;
  private saved: SavedSheet | null;
  private readonly capture = new ChordCapture();
  private readonly listeners = new Set<() => void>();
  private past: Point[] = [];
  private future: Point[] = [];
  private gestureDuration: number | null = null;
  private gate = false;
  constructor(score: LeadSheet, saved: SavedSheet | null, private readonly id: () => string = () => crypto.randomUUID()) {
    this.saved = saved;
    this.view = { score, position: { measureIndex: 0, offsetTicks: 0 }, title: score.title,
      tutorial: saved?.tutorialUrl ?? "", dirty: false, selectedId: null, entry: "paused", duration: 1920,
      notice: "Choose a position, then start MIDI entry. Release all keys to insert a chord.",
      pending: null, alternatives: [], lastEventId: null, undoCount: 0, redoCount: 0, writable: false, canCapture: false };
    this.baseline = this.content();
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private content() { return JSON.stringify([this.view.score.measures, this.view.title, this.view.tutorial]); }
  private update(patch: Partial<DraftSnapshot>) {
    this.view = { ...this.view, ...patch, undoCount: this.past.length, redoCount: this.future.length };
    this.view = { ...this.view, dirty: this.content() !== this.baseline };
    for (const listener of this.listeners) listener();
  }
  private cancel() { this.capture.setEnabled(false); this.gestureDuration = null; }
  configure(writable: boolean, connected: boolean, blocked: boolean) {
    const canCapture = writable && connected && !blocked;
    this.gate = canCapture;
    if (this.view.writable === writable && this.view.canCapture === canCapture) return;
    if (!canCapture) this.cancel();
    this.update({ writable, canCapture, ...(!canCapture ? { entry: "paused" as const } : {}) });
  }
  acceptSaved(saved: SavedSheet | null) {
    if (!saved || saved === this.saved) return;
    this.saved = saved;
    this.cancel();
    const sameMusic = JSON.stringify(saved.score.measures) === JSON.stringify(this.view.score.measures);
    if (!sameMusic) { this.past = []; this.future = []; }
    this.view = { ...this.view, score: saved.score, title: saved.score.title, tutorial: saved.tutorialUrl ?? "",
      ...(!sameMusic ? { position: { measureIndex: 0, offsetTicks: 0 }, selectedId: null, lastEventId: null, alternatives: [] } : {}),
      entry: "paused", pending: null };
    this.baseline = this.content();
    this.update({ notice: "Saved. Start MIDI entry when you are ready." });
  }
  details(title: string, tutorial: string) { this.pause(); this.update({ title, tutorial }); }
  pause = () => { this.cancel(); this.update({ entry: "paused" }); };
  setDuration(duration: number) {
    if (!this.view.writable || !(CHORD_DURATIONS as readonly number[]).includes(duration)) return;
    this.cancel();
    this.update({ duration, entry: "paused", pending: this.view.pending ? { ...this.view.pending, duration } : null,
      notice: this.view.pending ? "Duration changed for the captured chord. Apply it when ready." : "Duration changed. Start MIDI entry to continue." });
  }
  selectPosition(position: ChordPosition) {
    if (!this.view.writable || !Number.isInteger(position.measureIndex) || position.measureIndex < 0 ||
      position.measureIndex > this.view.score.measures.length || position.measureIndex >= 256 ||
      !Number.isInteger(position.offsetTicks) || position.offsetTicks < 0 || position.offsetTicks >= 1920) return;
    this.cancel();
    this.update({ position, selectedId: null, entry: "paused",
      pending: this.view.pending ? { ...this.view.pending, position, replaceId: null } : null,
      alternatives: this.view.pending ? this.view.alternatives : [],
      notice: this.view.pending ? "Captured chord moved to this position. Apply it when ready." : "Position selected. Start MIDI entry when ready." });
  }
  selectChord(id: string) {
    if (!this.view.writable) return;
    const found = findChord(this.view.score, id);
    if (!found) return;
    this.cancel();
    this.update({ selectedId: id, position: found.position, duration: found.event.durationTicks, entry: "paused", pending: null,
      alternatives: id === this.view.lastEventId ? this.view.alternatives : [], notice: "Entry paused while you change this chord." });
  }
  arm(replace = false) {
    if (!this.gate) return;
    if (replace && !this.view.selectedId) return;
    if (!replace && this.view.selectedId) {
      this.update({ notice: "Choose an empty position, or use Replace from MIDI for this chord." }); return;
    }
    this.capture.setEnabled(true);
    this.gestureDuration = null;
    this.update({ entry: replace ? "replace" : "insert", pending: null,
      notice: replace ? "Play the replacement chord, then release all keys. Only this chord will change."
        : "Entry on. Release all keys to insert; sustain does not delay insertion." });
  }
  receive = (event: MidiInputEvent) => {
    if (event.type === "reset") {
      this.capture.reset(event.held);
      this.gestureDuration = null;
      this.update({ entry: "paused", notice: "MIDI input reset. Release the keys, then start entry again." });
      return;
    }
    if (this.gestureDuration === null && this.view.entry !== "paused" && event.data.length === 3 &&
      (event.data[0] & 0xf0) === 0x90 && event.data[2] > 0) this.gestureDuration = this.view.duration;
    const notes = this.capture.receive(event.data);
    if (!notes || !this.gate || this.view.entry === "paused") return;
    const duration = this.gestureDuration ?? this.view.duration;
    this.gestureDuration = null;
    const recognition = recognizeChord(notes);
    if (recognition.pitchClasses.length < 2) { this.update({ notice: "Play a chord with at least two different pitches. Single notes are for the later melody pass." }); return; }
    const alternatives = recognition.candidates.map((item) => item.symbol);
    const pending: Pending = { notes, position: this.view.position, duration,
      replaceId: this.view.entry === "replace" ? this.view.selectedId : null };
    if (!alternatives.length) {
      this.cancel();
      this.update({ entry: "paused", pending, alternatives: [], notice: "Chord not recognized. Enter its symbol below, or discard this capture." });
      return;
    }
    this.commitCapture(pending, alternatives[0], alternatives);
  };
  private record(score: LeadSheet, position: ChordPosition, extra: Partial<DraftSnapshot>) {
    this.past = [...this.past.slice(-99), { score: this.view.score, position: this.view.position }];
    this.future = [];
    this.update({ score, position, pending: null, ...extra });
  }
  private commitCapture(pending: Pending, symbol: string, alternatives: string[]) {
    try {
      const result = pending.replaceId
        ? replaceChord(this.view.score, pending.replaceId, symbol, pending.duration)
        : insertChord(this.view.score, pending.position, symbol, pending.duration, this.id);
      if (pending.replaceId) this.cancel();
      this.record(result.score, result.position, { selectedId: null, lastEventId: result.eventId, alternatives,
        ...(pending.replaceId ? { entry: "paused" as const } : {}), notice: pending.replaceId ? "Chord replaced. Entry paused." : `${symbol} inserted. Ready for the next chord.` });
    } catch (error) {
      this.cancel();
      this.update({ entry: "paused", pending, alternatives, notice: error instanceof Error ? error.message : "Could not insert this chord." });
    }
  }
  applyPending(symbol: string) {
    if (this.view.writable && this.view.pending) this.commitCapture(this.view.pending, symbol.trim(), this.view.alternatives);
  }
  discardPending() { this.update({ pending: null, notice: "Capture discarded. Your score is unchanged." }); }
  changeSelected(symbol: string, duration: number) {
    if (!this.view.writable || !this.view.selectedId) return;
    this.cancel();
    try {
      const result = replaceChord(this.view.score, this.view.selectedId, symbol.trim(), duration);
      this.record(result.score, this.view.position, { entry: "paused", duration, notice: "Chord changed." });
    } catch (error) { this.update({ entry: "paused", notice: error instanceof Error ? error.message : "Could not change this chord." }); }
  }
  deleteSelected = () => {
    if (!this.view.writable || !this.view.selectedId) return;
    this.cancel();
    const score = deleteChord(this.view.score, this.view.selectedId);
    this.record(score, this.view.position, { entry: "paused", selectedId: null, lastEventId: null, alternatives: [], notice: "Chord deleted. The timeline and melody are unchanged." });
  };
  undo = () => this.history(false);
  redo = () => this.history(true);
  private history(redo: boolean) {
    if (!this.view.writable) return;
    const source = redo ? this.future : this.past;
    const point = source.at(-1);
    if (!point) return;
    this.cancel();
    const current = { score: this.view.score, position: this.view.position };
    if (redo) { this.future = this.future.slice(0, -1); this.past = [...this.past.slice(-99), current]; }
    else { this.past = this.past.slice(0, -1); this.future = [...this.future.slice(-99), current]; }
    this.update({ ...point, entry: "paused", pending: null, selectedId: null, alternatives: [], lastEventId: null,
      notice: redo ? "Change restored. Entry paused." : "Change undone and insertion position restored. Entry paused." });
  }
}
