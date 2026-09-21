# M4 chord authoring contract

This contract defines the shared musical behavior for the web and native Android editors. The score remains version 1: C key signature, 4/4, 480 ticks per quarter, one melody voice and a separate chord lane. Editing the chord lane must preserve existing melody, pitch spelling, ties and event IDs in the other lane.

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

This deterministic ordering supplies a suggested name, not a claim that an ambiguous voicing has one correct musical interpretation. The editor automatically inserts a recognized gesture with the preferred name and keeps alternatives and manual naming available for correction. Chord entry requires at least two distinct pitch classes; a single pitch class is ignored until melody entry in M5. An unknown voicing with at least two pitch classes is retained for explicit manual naming instead of being assigned an invented chord. A new name can be any trimmed printable text of 1–32 Unicode codepoints, such as `N.C.`, `iiø7/V` or `F♯m7`; the editor renders it as text. Control, formatting, unpaired surrogate and line/paragraph separator characters are rejected. Naming never interprets HTML.

## Positions, duration and correction

`ChordPosition` is `{ measureIndex, offsetTicks }`. The selected durations in ticks are 240, 480, 720, 960, 1440 and 1920: eighth, quarter, dotted quarter, half, dotted half and whole notes.

`insertChord(score, position, symbol, duration, idFactory)` inserts only into free space. It returns `{ score, position, eventId }`, with the cursor advanced by that duration. Ending exactly at tick 1920 advances to offset zero of the next bar. The next bar can be a virtual position at `measureIndex === score.measures.length`; the actual bar is created only when a chord is inserted there. The ID factory is called first for the chord and then for that new bar, if needed.

Insertion rejects overlap, a position outside the sheet or its virtual next bar, and a duration crossing the barline. It never overwrites an occupied slot, silently truncates a chord or creates more than 256 measures. Existing chords are kept in offset order. A virtual next bar may contain a deliberate initial gap when its insertion offset is greater than zero.

`replaceChord(score, eventId, symbol, duration)` returns the same result shape. It retains the original chord ID and offset, advances from that original position by the new duration, and permits shortening or expansion only inside available space. A correction must not move or shorten its neighbours.

`deleteChord(score, eventId)` returns the updated score. It leaves a gap and retains the measure, surviving event positions and melody. `findChord(score, eventId)` returns `{ event, position }` or `null`; the UI uses it to resolve a selected ID against the current score.

All mutations are immutable and validate the resulting score. Input and existing melody are never modified. Errors distinguish invalid position, duration, symbol or ID; occupied space; barline crossing; the measure limit; and a chord removed since selection. Failed insertion should leave the user's recognized or manually named candidate available so that choosing a shorter duration or another slot does not require replaying it. Undo and redo belong to the editor's score history; capture state is transient and must be reset during history or selection changes.

## Shared acceptance fixtures

- [`chord-recognition-cases.json`](../../tests/fixtures/music/chord-recognition-cases.json) preserves the original M2 identity requirements, including seventh chords without a fifth.
- [`chord-authoring-cases.json`](../../tests/fixtures/music/chord-authoring-cases.json) specifies exact alternative order and raw MIDI gesture completion. Each byte step has either its expected completed gesture or no completion. `resetHeld` contains physical identities and disables capture.
- [`chord-entry.test.ts`](../../contracts/src/chord-entry.test.ts) covers every vocabulary entry in all twelve keys, immutable corrections, bar and overlap bounds, safe manual names, original melody preservation and the shared gesture cases. Native tests apply the same shared recognition and gesture fixtures.

Device arrival order is the only timing dependency in this milestone. There is no debounce delay, metronome quantization or wall-clock duration inference in chord capture; duration is chosen explicitly by the user.
