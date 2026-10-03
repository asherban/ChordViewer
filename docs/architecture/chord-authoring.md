# Chord authoring contract

This contract defines chord behavior for the web and native Android editors. Scores use 480 ticks per quarter, one melody voice and an independent chord lane. [Melody authoring](melody-authoring.md) defines supported keys and meters. Editing chords preserves the melody, including pitch spelling, ties and event IDs.

## Automatic insertion gesture

Capture consumes every ordered three-byte MIDI message from the active input. It never infers gestures from rendered keyboard snapshots, which can miss a quick press and release between frames.

A gesture starts with the first physical note-on after capture is armed and all earlier keys have been released. Its candidate is the union of pitches played while any physical key remains down. Rolled chords, overlapping notes and a repeated note inside that overlap belong to the same gesture. A real note-off, or a note-on with velocity zero, completes it only when the last physical key is released. The result contains sorted, distinct MIDI pitches; octave duplicates remain until recognition so the lowest bass can be determined.

Physical keys use the identity `channel * 128 + note`. The same note held on two channels therefore needs its own release on each channel. Duplicate note-ons for one physical identity do not require extra note-offs. The sustain pedal does not delay completion. Sustain can continue sounding in the MIDI monitor while the released chord is inserted.

Capture receives input while disarmed so that arming halfway through a played chord cannot insert its tail. `setEnabled(...)` always clears the candidate and waits for all currently held keys to be released. Disabling capture, changing the active editing context or reconnecting an input must not complete a candidate. `reset(heldIds)` clears the candidate, disables capture and optionally seeds the current held-key identities; a newly mounted editor uses that seed before arming.

CC120 (all sound off), CC123 (all notes off), and channel-mode controllers CC124–127 clear physical keys on their channel and cancel the whole pending gesture. If keys on another channel remain held, capture waits for those to release. These controller messages never insert a chord. CC121 (reset controllers), sustain and unrelated controllers do not end or clear a physical gesture. Malformed MIDI messages are ignored.

## Recognition and alternatives

The single vocabulary is [`contracts/fixtures/chord-vocabulary-v1.json`](../../contracts/fixtures/chord-vocabulary-v1.json). Both clients bundle it and apply the same algorithm, without relying on a third-party chord naming library for authoring.

Recognition deduplicates pitch classes and retains the lowest MIDI note as bass. Every candidate must exactly match a vocabulary entry after transposition: all required intervals must occur, optional intervals may be absent, and extra pitch classes are rejected. The vocabulary includes major and minor triads, sevenths, suspended, diminished, augmented and sixth chords, common extensions and power fifths. Several seventh and extension voicings permit an omitted fifth; thirteenths also permit an omitted ninth and eleventh. Missing roots are not inferred.

Candidate identities are ordered by:

1. A root that equals the played bass pitch class.
2. The vocabulary entry's order.
3. Ascending root pitch class.

Each identity produces its flat spelling followed by a distinct sharp spelling, when applicable. A bass different from the root adds a slash. For example, the notes E3, C4 and G4 yield `C/E`; Db, F and Ab offer `Db` and `C#`. C, E, G and A with C lowest offer `C6`, then `Am7/C`; changing the bass to A changes the preferred name to `Am7`.

This deterministic ordering supplies a suggested name, not a claim that an ambiguous voicing has one correct musical interpretation. The editor automatically appends a recognized gesture with the preferred name. Manual construction is independent of the recognition vocabulary: the tablet opens one complete structured builder directly at a chord or the append marker. Unknown voicings remain pending and reopen as a custom tone set through Assign captured chord. Opening or editing the popup pauses capture. Practice input never writes music. Recognized imported aliases retain their exact spelling for duration-only edits. A stored chord without a v3 definition must resolve to a supported legal construction. Malformed or unsupported text is rejected at score/import/save and entry boundaries; it never becomes an arbitrary C chord. Every legal chord opens the complete builder immediately. Applying construction writes its canonical preview and definition.

## Logical timing and correction

The append position is the absolute end of the final logical chord, independent of melody and old insertion bookmarks. Every fresh ordinary Add dialog and successful Add resets the next construction to C major with natural spelling, Root bass and whole-bar duration. Extensions, alterations, added/omitted tones, custom sets, polychords, expanded controls and scrolling reset together. A failed Add retains its draft and duration. Pending MIDI assignment retains its captured tones and duration until successful Add. The duration never shortens to the time remaining in a bar. MIDI entry outside a popup reset continues using its chosen duration. An entered span crossing barlines is rendered as separate events sharing a `logicalId` that references the first fragment's real event ID. Independent adjacent equal symbols have different identities.

A bass letter immediately selects its natural note and closes the dropdown. Reopen the dropdown to choose that letter's flat, double-flat, sharp or double-sharp variant. This also applies to component and whole-stack bass. Root clears the independent bass and follows the chord's root.

Tapping any fragment selects that whole chord. Apply replaces its definition without changing its duration or start. An existing chord's duration slider commits on release and shifts later logical chords by the exact delta, preserving intervening gaps. Delete removes the complete selected span and shifts later harmony backward. Melody events, pitches, ties, offsets and IDs remain unchanged. Empty trailing bars are trimmed; every authored melody event, including an explicit rest, protects its bar. At least one bar remains.

Each successful Add, Apply, Delete or completed duration gesture is one undo step. Undo restores logical identity, music, bars and relevant selection/cursor state. Symbol construction is a local preview until Apply/Add; Close, Cancel, outside dismissal and Back discard that preview. Closing after a released duration gesture keeps the committed timing change. Cancellation of a slider drag changes nothing. Editing a selected chord never changes the remembered new-chord duration.

All mutations validate the complete result before committing. Event/bar limits, IDs, schema, group continuity and the compact UTF-8 document-size bound can reject an edit atomically. Failed captured input stays available for correction. A logical chord creates one practice target; all its rendered fragments highlight and select that target. Ordinary tonal matching retains vocabulary optional tones; custom, altered and explicitly omitted constructions use their exact pitch-class set, with an independent explicit bass constraint.

The web retains its existing form and score-position gestures, but reads, saves, imports, transposes and practices the same v3 definitions and groups. Its compatibility overwrite operation splits surviving logical spans into distinct groups. Whole-bar insertion extends a sustained group across an inserted bar so continuity remains valid.

## Complete construction

Score v3 stores tonal, custom, N.C. or flat two-to-four-component polychord definitions. Roots/basses use C–B with double-flat through double-sharp spellings. Tonal families include major, minor, diminished, augmented, power, sus2 and sus4; seventh and extension choices plus Add/Alter/Omit degree 1–13 cover conventional constructions. Custom sets cover every nonempty subset of the 12 relative pitch classes. Each polychord component has its own root/type, custom set and slash bass, with an optional independent whole-stack bass. Nested stacks and silent stack components are rejected consistently by schema and runtime validation.

Generated labels are deterministic. Power extensions show explicit degrees, such as `C5(add6)` and `C5(addb7,add9)`. Modifier arrays and JSON property order are semantically unordered; stack component order and pitch spelling are meaningful. V3 labels allow up to 512 codepoints. V1/v2 keep their structural limits and remain readable with supported legal symbols, including all existing MIDI vocabulary and MusicXML harmony kinds. Unsupported text requires an explicit v3 construction. The normal demo audit found all seven stored events legal across three sheets, so no database row was rewritten. One persisted demo recovery record had three exact `Gbm13!` fields repaired to `Gbm13` with a private original backup. Editing harmony writes v3.

## Shared acceptance fixtures

- [`chord-recognition-cases.json`](../../tests/fixtures/music/chord-recognition-cases.json) preserves the original M2 identity requirements, including seventh chords without a fifth.
- [`chord-authoring-cases.json`](../../tests/fixtures/music/chord-authoring-cases.json) specifies exact alternative order and raw MIDI gesture completion. Each byte step has either its expected completed gesture or no completion. `resetHeld` contains physical identities and disables capture.
- [`chord-entry.test.ts`](../../contracts/src/chord-entry.test.ts) covers recognition, safe names and the low-level free-space operations. [`fast-entry.test.ts`](../../contracts/src/fast-entry.test.ts) covers the editor's overwrite, extension, move and bar-insertion behavior. Native tests cover equivalent musical cases and the shared MIDI fixtures.
- [`chord-construction-v3.json`](../../contracts/fixtures/chord-construction-v3.json) covers complete definitions, symbols and pitch classes; [`chord-dialog.test.ts`](../../contracts/src/chord-dialog.test.ts) and native `ChordDialogTest` verify logical timing, transposition, practice, strict validation and persistence.
- [Complete dialog verification](chord-dialog-verification.md) records commands and genuine tablet evidence.

Device arrival order is the only timing dependency in this milestone. There is no debounce delay, metronome quantization or wall-clock duration inference in chord capture; duration is chosen explicitly by the user.
