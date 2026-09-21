# Melody, direct entry and import

M5 decisions, 2026-09-22. The user selected MusicXML plus ChordViewer JSON and requested other keys and time signatures now. These rules apply to both the web and native Android clients. The [chord authoring rules](chord-authoring.md) still define chord recognition and physical MIDI gesture capture.

## Musical scope

One treble melody voice shares the timeline with an independent chord lane. Notes and rests support whole, half, quarter, eighth and sixteenth values, each plain or dotted once. Pitches have explicit letter, single flat/natural/sharp and octave 3–6. MIDI entry accepts C3–B6 and chooses a spelling appropriate to the score key; direct correction can change that spelling. Tuplets, grace notes, multiple voices and simultaneous two-hand capture remain later work.

Score version 2 supports all 15 standard major and 15 minor signatures, with a global meter of 1–12 beats over 2, 4 or 8. Version 1 remains readable with its original C/4/4 restrictions. New blank sheets use version 2. Changing key preserves written pitches; it is not transposition. Changing meter keeps events at their existing bar/offset and rejects any change that would truncate an event. Existing ties are removed only when a pitch, duration or bar-boundary change makes them invalid.

## Create workflow

Choose the chord or melody pass. Each remembers its own cursor; the first melody pass begins at bar 1, beat 1. Choose a duration, then explicitly start MIDI entry. A melody gesture must contain exactly one pitch and inserts on physical release. Sustain does not delay insertion or merge repeated notes. Overlapping pitches are rejected and pause entry until explicitly restarted. Entry advances by written duration, independent of how long a key was held. It can extend the sheet up to 256 measures.

An insertion cannot silently overwrite another event or split across a barline. A capture that cannot fit remains pending: change its position, spelling or duration, then apply it or discard it. Changing pass or score settings must not silently discard that capture. Both clients expose fine positions down to 60 ticks (one thirty-second of a whole note) and preserve valid existing off-grid offsets.

Manual chord, note and rest entry works without MIDI. Select a chord on the sheet to edit its symbol/duration. Select a melody event on the staff or in the event picker to edit pitch, accidental, octave, duration or note/rest type. Deleting a melody note leaves an equal-duration rest; deleting a chord clears only that chord. A tie requires the following melody event to be adjacent with exactly the same written pitch. MIDI replacement is explicitly armed, changes only the selected event, and pauses after one gesture.

One bounded history keeps up to 100 musical edits across both lanes, key/meter changes, active lane, cursor and selected durations. Title/tutorial fields are separate from musical undo. Editing, dialogs, mode changes, input changes, saves and backgrounding pause MIDI entry. Practice never writes incoming notes. Explicit saves retain the existing owner and revision checks; drafts survive navigation and failed saves but not a reload or app process death.

## Import and export

Library accepts local `.musicxml`, `.xml` and ChordViewer `.json` files up to 1 MiB. Parsing occurs locally; the user inspects the score and conversion warnings before choosing **Save as new sheet**. Import creates a new server-owned identity in the signed-in library, even if the source ID matches an existing sheet. It never overwrites a source sheet. The same account quota, request size and authentication rules apply as ordinary creation.

MusicXML accepts one `score-partwise` part, one treble staff and one melody voice, with the supported keys, meter, note/rest durations, ties and harmony symbols. Divisions must convert exactly to 480 ticks per quarter. A harmony continues until the next symbol or `kind=none`. Missing key/meter defaults to C/4/4. Unsupported notation is rejected with a reason: compressed MXL, pickups, repeats/navigation, multiple parts/voices/staves, tuplets, grace notes, transposition, mid-score key/meter changes, microtones and unsupported chord kinds/degrees. Lyrics, layout, dynamics and performance metadata are omitted with an explicit preview warning. See the [shared import fixtures](../../tests/fixtures/music/import/README.md).

JSON export writes the exact current score draft, including title, IDs, spelling, timing, key, meter and ties. It excludes account information and the separately stored YouTube URL. Export is independent of saving to the library. The browser downloads a JSON file; Android uses its native create-document picker. Android imports only the selected document and does not retain document access.

Imports never fetch file-supplied URLs. Both parsers bound input size and nesting, reject duplicate JSON fields, DTD/entity declarations and unsupported structures, and validate the resulting score before preview or persistence. The server accepts canonical score JSON only, not XML or remote import URLs.

## Local acceptance

Use the [README developer commands](../../README.md) with the local test backend. The launcher broadcasts **P** for chords or **M** for melody. For the melody sequence, create a G-major 3/4 sheet, select quarter notes and arm the melody pass on each client. C4, D4, F-sharp4, F-sharp4, G4 and A4 fill two bars, including repeated notes under sustain. Browser input uses the real Web MIDI/LoopBe path; native emulator input uses the existing debug adapter. These checks require no piano or physical tablet.
