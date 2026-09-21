import { keyAccidentals, type LeadSheet, type MelodyEvent } from "@chordviewer/contracts";

/** Tied continuations retain pitch, but do not set the new bar's accidental state. */
export function melodyAccidentals(score: LeadSheet): Map<string, string> {
  const signs = new Map<string, string>();
  const defaults = keyAccidentals(score.keySignature);
  let previous: MelodyEvent | undefined;
  for (const measure of score.measures) {
    const state = new Map<string, number>();
    for (const event of measure.melody) {
      const continuation = previous?.kind === "note" && previous.tieToNext;
      if (event.kind === "note" && !continuation) {
        const key = `${event.pitch.step}${event.pitch.octave}`;
        if ((state.get(key) ?? defaults[event.pitch.step]) !== event.pitch.alter)
          signs.set(
            event.id,
            event.pitch.alter === 1
              ? "#"
              : event.pitch.alter === -1
                ? "b"
                : "n",
          );
        state.set(key, event.pitch.alter);
      }
      previous = event;
    }
  }
  return signs;
}
