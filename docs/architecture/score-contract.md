# Score and API contract

The web, API and native Android client share an editable score contract. M2 established version 1; M3 added authenticated persistence; M5 adds version 2 for expanded keys and meters while retaining strict v1 reading. The [original four-bar fixture](../../contracts/fixtures/lead-sheet-v1.json) remains a valid v1 document.

## Canonical definitions

- [Lead sheet JSON Schema v1](../../contracts/src/lead-sheet-v1.schema.json) defines fields, exact types and size limits. It uses JSON Schema draft 7; its `$id` is a stable schema identifier, not a requirement to fetch a remote resource.
- [Lead sheet JSON Schema v2](../../contracts/src/lead-sheet-v2.schema.json) extends only the key/meter and corresponding timing bounds. New blank sheets use v2; changing settings on a v1 sheet upgrades that draft explicitly.
- [TypeScript types and validator](../../contracts/src/index.ts) export `LeadSheet`, `Measure`, `ChordEvent`, `MelodyEvent`, `NoteEvent`, `RestEvent`, `Pitch`, `NoteDuration`, `scoreSchema`, `durationTicks` and `parseScore` from `@chordviewer/contracts`.
- [OpenAPI contract](../../contracts/openapi.yaml) describes authentication, personal libraries, import and revision-checked writes.
- [Shared conformance cases](../../tests/fixtures/music/score-validation-cases.json) give both clients identical valid and invalid inputs. `expectedCode` identifies one TypeScript diagnostic; native readers must agree on validity rather than exception wording.

`parseScore(value)` returns the validated object or throws `ScoreValidationError` with `{ code, path, message }` issues. It never coerces numbers, reorders events, changes pitch spelling, fills gaps or strips unknown fields. JSON Schema covers structural checks; the validator additionally checks musical timing, identity and ties. Native validation implements the same rules.

## Version 1 scope

| Area | Contract |
| --- | --- |
| Document | `schemaVersion: 1`, `id`, `title`, `keySignature`, `timeSignature`, `ticksPerQuarter`, `measures`. No other fields. |
| Notation proof | C key signature, 4/4, 480 ticks per quarter, one treble melody voice. Accidentals are supported despite the fixed key signature. |
| Identity | Sheet, measures and events each have an ID. All IDs are unique throughout one sheet. IDs contain 1–64 ASCII letters, digits, underscores or hyphens. They can be created locally; this contract assumes neither server-generated IDs nor authorization from knowing an ID. |
| Text | Title: 1–200 Unicode code points. Chord symbol: 1–32 Unicode code points. NUL and unpaired UTF-16 surrogates are rejected because they cannot be stored in PostgreSQL text/JSONB. Valid strings are preserved as supplied, including spelling and case. |
| Structure | 1–256 measures. Each measure has `id`, `chords` and `melody`. Each lane contains at most 64 events. Chord-only measures, empty measures and partially entered melody are valid. |
| Chord event | `id`, `offsetTicks`, `durationTicks`, `symbol`. Symbols are display text at this stage, not parsed chord identity. |
| Melody event | `id`, `kind`, `offsetTicks`, `duration`, and a `pitch` for notes. `kind` is `note` or `rest`. |
| Duration | `denominator` is 1, 2, 4, 8 or 16; `dots` is 0 or 1. Written duration is independent of how long a MIDI key was physically held. |
| Pitch | `step` is C–B, `alter` is −1, 0 or 1, and `octave` is 3–6. Spelling is explicit: C-sharp and D-flat are distinct spellings. |
| Tie | Notes may contain `tieToNext: true` or `false`. Rests must contain neither a pitch nor a tie field, even a false one. |

Version 1 keeps these limits permanently. Version 2 retains the same fields and notation events but accepts all standard major/minor key signatures (−7 through +7 fifths) and a global time signature with numerator 1–12 and denominator 2, 4 or 8. It retains 480 ticks per quarter. There is no mid-score key/meter change, transposition or automatic re-barring. Existing saved v1 scores are not bulk rewritten; both clients and the API accept either validated version. See [M5 authoring and import](melody-authoring.md).

## Timing and ties

Version 1 measures span 1,920 ticks. Version 2 uses `measureTicks = numerator × 1920 / denominator`, from 240 to 11,520 ticks. Offsets are integers from zero up to the measure's end (exclusive); a positive integer chord duration must fit within the bar. Melody duration is calculated as:

`durationTicks = 1920 / denominator × (dots == 1 ? 1.5 : 1)`

For example, a dotted quarter note is 720 ticks and a dotted eighth rest is 360 ticks. An event occupies the interval from its offset up to, but excluding, its ending tick. Its end must not exceed the bar length. A note continuing across a barline uses separate notes linked by a tie. Chords and rests use separate events without tie fields. One oversized event is invalid.

Both event arrays are chronological. Events cannot overlap within one lane; chords and melody can overlap each other. Gaps are valid while a sheet is being created, and validation does not silently insert rests.

A true `tieToNext` must connect to the next melody event in score order. That target must be a note with exactly the same step, alteration and octave, and must start at the source's ending tick. A tie can cross into the immediately following measure at offset zero. It cannot target a rest, skip time or an empty measure, change spelling, or dangle at the end of the sheet.

Accidentals belong to written pitch. Renderers initialize each measure from the key signature, then track changes per step/octave. The fixture's F-natural explicitly cancels its earlier F-sharp. A cross-bar tie continues the existing sounding note and does not establish accidental state for later untied notes in the new bar. Renderer behavior is tested separately from structural validation.

## Shared proof and regression data

The canonical `First Sketch` fixture includes chord symbols, notes and rests, sharp/natural cancellation, a flat, dotted notes, a dotted rest, and two cross-bar ties. Both clients use this single JSON source. Android copies it into application assets during its build; the web and API use the contracts package's fixture export.

The shared conformance matrix covers unknown fields, incorrect numeric types, bounds, duplicate IDs, ordering, overlap, out-of-bar durations and malformed ties, alongside chord-only and incomplete melody examples. String limits count Unicode code points in both implementations, not UTF-16 storage units. JSON numbers such as `1.0` are integers when mathematically integral; numeric strings remain invalid.

[Chord recognition expectations](../../tests/fixtures/music/chord-recognition-cases.json) preserve useful old behavior for later MIDI authoring work without retaining the old application. They distinguish major/minor qualities, account for omitted fifths, remove octave duplicates and preserve the lowest played bass. They do not claim that a new recognizer has been implemented in M2, and do not preserve the old lowercasing or slash-parsing mistakes.

## Local API

| Endpoint | Result |
| --- | --- |
| `GET /health` | Reports API availability and migrated database readiness; returns 503 when unavailable. |
| `GET /api/v1/score-example` | The canonical `LeadSheet` object, validated before serving and serialized using the shared schema. |

The container API is published only to host loopback on port 3000 (development) or 3001 (test). Authenticated library endpoints include blank/example creation, import-as-new and revision-checked full-score saves. The [backend contract](backend-contract.md) defines ownership, credentials, limits and request-origin checks. The web development server proxies its local API; native debug uses explicit ADB forwarding. NAS deployment and public exposure remain later milestones.

The contracts package builds to JavaScript and declarations under its ignored `dist` directory. The API's production command runs compiled JavaScript with Node. Development uses the root workspace's TypeScript runner. The shared fixture is an exported package asset, so the API does not read arbitrary repository paths at runtime. Root development/build commands build contracts before the clients that import it.

Run `npm run test:run` for unit/contract checks, and `npm run test:api` against the isolated local test backend for authentication, ownership, import, quota and persistence boundaries. Android runs shared validity, authoring and import cases through its native implementations. See the [README](../../README.md) for browser and real-driver/emulator acceptance commands.
