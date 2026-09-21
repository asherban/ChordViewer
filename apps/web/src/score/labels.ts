import { keyLabel, type LeadSheet, type MelodyEvent, type NoteDuration, type Pitch } from "@chordviewer/contracts";

export const pitchLabel = (pitch: Pitch) => `${pitch.step}${pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : ""}${pitch.octave}`;
export const durationLabel = (duration: NoteDuration) => `${duration.dots ? "Dotted " : ""}${({ 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "sixteenth" })[duration.denominator]}`;
export const durationValue = (duration: NoteDuration) => `${duration.denominator}:${duration.dots}`;
export const beatLabel = (ticks: number, score: LeadSheet) => String(1 + ticks * score.timeSignature.denominator / 1920);
export const meterLabel = (score: LeadSheet) => `${score.timeSignature.numerator}/${score.timeSignature.denominator}`;
export const settingsLabel = (score: LeadSheet) => `${keyLabel(score.keySignature)} · ${meterLabel(score)}`;
export const melodyLabel = (event: MelodyEvent) => `${event.kind === "note" ? pitchLabel(event.pitch) : "Rest"}, ${durationLabel(event.duration).toLowerCase()}${event.kind === "note" && event.tieToNext ? ", tied" : ""}`;
