# Melody, direct entry and import

These rules apply to the web and native Android clients. Import supports MusicXML and ChordViewer JSON. The [chord authoring rules](chord-authoring.md) define chord recognition and physical MIDI gesture capture.

## Musical scope

One treble melody voice shares the timeline with an independent chord lane. Notes and rests support whole, half, quarter, eighth and sixteenth values, each plain or dotted once, plus undotted thirty-second values. Pitches have explicit letter, single flat/natural/sharp and octave 3–6. MIDI entry accepts C3–B6 and chooses a spelling appropriate to the score key; direct correction can change that spelling. Tuplets, grace notes, multiple voices and simultaneous two-hand capture remain later work.

Score version 2 supports all 15 standard major and 15 minor signatures, with a global meter of 1–12 beats over 2, 4 or 8. Version 1 remains readable with its original C/4/4 restrictions. New blank sheets use version 2. Changing key preserves written pitches; it is not transposition. Changing meter keeps events at their existing bar/offset and rejects any change that would truncate an event. Existing ties are removed only when a pitch, duration or bar-boundary change makes them invalid.

## Create workflow

Choose the chord or melody pass. The chord pass remembers its cursor. The melody cursor follows the end of the last written note or rest, including when reopening a sheet. A visible line marks this position in the score. There is no separate melody entry stave or bar/beat picker.

Tap the entry line at the desired pitch, optionally refine the pitch with a vertical drag, and release to place one note. The cursor advances automatically. Dragging an existing note changes its pitch while keeping its onset and duration fixed. A second finger or cancelled gesture makes no edit. A Rest control beside the cursor adds a rest; beside a selected note it replaces the note with an equal-duration rest. Selected notes expose accidental and tie controls nearby.

One slider beside the entry position controls duration. It snaps to plain and dotted values from thirty-second to dotted whole notes and commits on release. Changing a selected note's duration shifts every later melody event by the same difference, preserving gaps and leaving chords fixed. Otherwise the slider sets the next duration, initially a quarter note. Editing a selection preserves the duration remembered for new notes.

Notes that cross barlines split into supported tied fragments; rests split without ties. The sheet extends up to 256 bars. The entire edit fails if a rhythm is unrepresentable or a size limit is exceeded; captured input stays pending. Existing off-grid timing is preserved when representable. A tie requires the following event to be adjacent and have the same written pitch.

MIDI melody entry requires one pitch per gesture and writes on physical release. Sustain does not delay insertion or merge repeated notes. Overlapping pitches pause entry. Duration changes keep insertion armed, and changes while keys are held apply to the next gesture. Explicit MIDI replacement changes the selection and pauses after one gesture.

One bounded history keeps up to 100 musical edits across both lanes, including overwritten music, added bars, key/meter changes, cursors and entry durations. Title/tutorial fields are separate from musical undo. Touch editing, dialogs, mode changes, input changes, saves and backgrounding pause MIDI entry. Practice never writes incoming notes. Explicit saves retain the existing owner and revision checks. Local recovery preserves unsaved drafts independently of explicit library saves.


- Selecting a tied fragment edits the complete sounding note. The slider shows its combined duration.
- Delete removes the selected note or rest and shifts later melody back. Rest replacement preserves timing.
- Automatic notation rests fill unused time, including short thirty-second gaps. They do not change saved onsets or advance the entry cursor.
- Trailing bars without pitched notes or chords are removed on opening, editing and saving. Interior silent bars remain, and an empty sheet keeps one bar. Rest entry and an explicitly added bar temporarily reserve space for the next note or chord. The next-bar entry preview contains no rest glyphs. Undo restores bars removed by an edit.
- Successful local recovery writes remain silent; recovery failures still appear.

## Import and export

Library accepts local `.musicxml`, `.xml` and ChordViewer `.json` files up to 1 MiB. Parsing occurs locally; the user inspects the score and conversion warnings before choosing **Save as new sheet**. Import creates a new server-owned identity in the signed-in library, even if the source ID matches an existing sheet. It never overwrites a source sheet. The same account quota, request size and authentication rules apply as ordinary creation.

MusicXML accepts one `score-partwise` part, one treble staff and one melody voice, with the supported keys, meter, note/rest durations, ties and harmony symbols. Divisions must convert exactly to 480 ticks per quarter. A harmony continues until the next symbol or `kind=none`. Missing key/meter defaults to C/4/4. Unsupported notation is rejected with a reason: compressed MXL, pickups, repeats/navigation, multiple parts/voices/staves, tuplets, grace notes, transposition, mid-score key/meter changes, microtones and unsupported chord kinds/degrees. Lyrics, layout, dynamics and performance metadata are omitted with an explicit preview warning. See the [shared import fixtures](../../tests/fixtures/music/import/README.md).

JSON export writes the current score draft with unused silent trailing bars removed. It preserves title, IDs, spelling, timing, key, meter and ties. It excludes account information and the separately stored YouTube URL. Export is independent of saving to the library. The browser downloads a JSON file; Android uses its native create-document picker. Android imports only the selected document and does not retain document access.

Imports never fetch file-supplied URLs. Both parsers bound input size and nesting, reject duplicate JSON fields, DTD/entity declarations and unsupported structures, and validate the resulting score before preview or persistence. The server accepts canonical score JSON only, not XML or remote import URLs.

## Local acceptance

Use the [README developer commands](../../README.md) with the local test backend. The launcher broadcasts **P** for chords or **M** for melody. For the melody sequence, create a G-major 3/4 sheet, select quarter notes and arm the melody pass on each client. C4, D4, F-sharp4, F-sharp4, G4 and A4 fill two bars, including repeated notes under sustain. Browser input uses the real Web MIDI/LoopBe path; native emulator input uses the existing debug adapter. These checks require no piano or physical tablet.
