import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { LeadSheet } from "@chordviewer/contracts";
import type { SavedSheet } from "../library/api";
import type { MidiInputModel } from "../midi/useMidiInput";
import { ScoreDraft } from "./ScoreDraft";

export function useScoreDraft(score: LeadSheet, saved: (SavedSheet & { metadataOnly?: boolean }) | null, midi: MidiInputModel, writable: boolean, blocked: boolean) {
  const [model] = useState(() => new ScoreDraft(score, saved));
  const { subscribe } = midi;
  const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
  useLayoutEffect(() => subscribe(model.receive), [subscribe, model]);
  useLayoutEffect(() => { model.acceptSaved(saved, saved?.metadataOnly === true); }, [model, saved]);
  useLayoutEffect(() => { model.configure(writable, !!midi.selected, blocked); }, [model, writable, midi.selected, blocked]);
  return { model, view };
}
