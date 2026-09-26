// Public package surface. Internal modules import their dependencies directly.
export { TICKS_PER_QUARTER, TICKS_PER_MEASURE, durationTicks, measureTicks } from './score.js';
export type { Pitch, NoteDuration, ChordEvent, NoteEvent, RestEvent, MelodyEvent, Measure, LeadSheet } from './score.js';
export { scoreSchema, scoreSchemaV2, ScoreValidationError, parseScore } from './validation.js';
export type { ScoreIssueCode, ScoreIssue } from './validation.js';
export { KEY_SIGNATURES, SUPPORTED_KEYS, keyAccidentals, keyLabel, changeScoreSettings } from './music.js';
export type { KeySignature, TimeSignature } from './music.js';
export { isStorageSafeText } from './text.js';
export type { AccountSummary, SheetSummary, SavedSheet, SheetMetadataRequest, NewSheetRequest, SaveSheetRequest, ImportSheetRequest } from './library.js';
export { CHORD_DURATIONS, ChordEntryError, ChordCapture, insertChord, replaceChord, deleteChord, findChord, recognizeChord } from './chord-entry.js';
export type { ChordDuration, ChordPosition, ChordEdit, LocatedChord, ChordEntryIssue, ChordCandidate, ChordRecognition } from './chord-entry.js';
export { MELODY_DURATIONS, MelodyEntryError, midiToPitch, insertMelody, replaceMelody, deleteMelody, findMelody, setMelodyTie } from './melody-entry.js';
export { practiceEvents, practiceBar, firstPracticeEventInBar, supportsPracticeMatch,
  matchesPracticeChord, transposePracticeScore } from './practice.js';
export { PracticeSession } from './practice.js';
export type { MelodyPosition, MelodySpec, MelodyEdit, LocatedMelody, MelodyEntryIssue } from './melody-entry.js';
