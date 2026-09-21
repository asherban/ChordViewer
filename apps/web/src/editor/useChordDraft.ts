import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import type { SavedSheet } from "../library/api";
import type { MidiInputModel } from "../midi/useMidiInput";
import { ChordDraft } from "./ChordDraft";

export function useChordDraft(score: LeadSheet, saved: SavedSheet | null, midi: MidiInputModel, writable: boolean, blocked: boolean) {
  const [model] = useState(() => new ChordDraft(score, saved));
  const { subscribe } = midi;
  const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
  useLayoutEffect(() => subscribe(model.receive), [subscribe, model]);
  useLayoutEffect(() => { model.acceptSaved(saved); }, [model, saved]);
  useLayoutEffect(() => { model.configure(writable, !!midi.selected, blocked); }, [model, writable, midi.selected, blocked]);
  return { model, view };
}
