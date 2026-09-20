# Score and API contract

Milestone M2 establishes a shared, editable score representation and a local API proof. It does not add accounts, saved sheets or a database. The web client and native Android client consume the same [original four-bar fixture](../../contracts/fixtures/lead-sheet-v1.json).

## Canonical definitions

- [Lead sheet JSON Schema v1](../../contracts/src/lead-sheet-v1.schema.json) defines fields, exact types and size limits. It uses JSON Schema draft 7; its `$id` is a stable schema identifier, not a requirement to fetch a remote resource.
- [TypeScript types and validator](../../contracts/src/index.ts) export `LeadSheet`, `Measure`, `ChordEvent`, `MelodyEvent`, `NoteEvent`, `RestEvent`, `Pitch`, `NoteDuration`, `scoreSchema`, `durationTicks` and `parseScore` from `@chordviewer/contracts`.
- [OpenAPI contract](../../contracts/openapi.yaml) describes the local foundation endpoints.
- [Shared conformance cases](../../tests/fixtures/music/score-validation-cases.json) give both clients identical valid and invalid inputs. `expectedCode` identifies one TypeScript diagnostic; native readers must agree on validity rather than exception wording.

`parseScore(value)` returns the validated object or throws `ScoreValidationError` with `{ code, path, message }` issues. It never coerces numbers, reorders events, changes pitch spelling, fills gaps or strips unknown fields. JSON Schema covers structural checks; the validator additionally checks musical timing, identity and ties. Native validation implements the same rules.

## Version 1 scope

| Area | Contract |
| --- | --- |
| Document | `schemaVersion: 1`, `id`, `title`, `keySignature`, `timeSignature`, `ticksPerQuarter`, `measures`. No other fields. |
| Notation proof | C key signature, 4/4, 480 ticks per quarter, one treble melody voice. Accidentals are supported despite the fixed key signature. |
| Identity | Sheet, measures and events each have an ID. All IDs are unique throughout one sheet. IDs contain 1–64 ASCII letters, digits, underscores or hyphens. They can be created locally; this contract assumes neither server-generated IDs nor authorization from knowing an ID. |
| Text | Title: 1–200 Unicode code points. Chord symbol: 1–32 Unicode code points. Strings are preserved as supplied, including spelling and case. |
| Structure | 1–256 measures. Each measure has `id`, `chords` and `melody`. Each lane contains at most 64 events. Chord-only measures, empty measures and partially entered melody are valid. |
| Chord event | `id`, `offsetTicks`, `durationTicks`, `symbol`. Symbols are display text at this stage, not parsed chord identity. |
| Melody event | `id`, `kind`, `offsetTicks`, `duration`, and a `pitch` for notes. `kind` is `note` or `rest`. |
| Duration | `denominator` is 1, 2, 4, 8 or 16; `dots` is 0 or 1. Written duration is independent of how long a MIDI key was physically held. |
| Pitch | `step` is C–B, `alter` is −1, 0 or 1, and `octave` is 3–6. Spelling is explicit: C-sharp and D-flat are distinct spellings. |
| Tie | Notes may contain `tieToNext: true` or `false`. Rests must contain neither a pitch nor a tie field, even a false one. |

These are the supported M2 proof limits, not the complete future notation feature set. Extending the format requires updating both clients and the conformance suite. Once user data is persisted, changes rejected by an existing version's readers need an explicit version and migration policy.

## Timing and ties

Each measure spans 1,920 ticks. Offsets are integers from 0 through 1,919. A chord duration is an integer from 1 through 1,920. Melody duration is calculated as:

`durationTicks = 1920 / denominator × (dots == 1 ? 1.5 : 1)`

For example, a dotted quarter note is 720 ticks and a dotted eighth rest is 360 ticks. An event occupies the interval from its offset up to, but excluding, its ending tick. Its end must not exceed 1,920. A note continuing across a barline uses separate notes linked by a tie. Chords and rests use separate events without tie fields. One oversized event is invalid.

Both event arrays are chronological. Events cannot overlap within one lane; chords and melody can overlap each other. Gaps are valid while a sheet is being created, and validation does not silently insert rests.

A true `tieToNext` must connect to the next melody event in score order. That target must be a note with exactly the same step, alteration and octave, and must start at the source's ending tick. A tie can cross into the immediately following measure at offset zero. It cannot target a rest, skip time or an empty measure, change spelling, or dangle at the end of the sheet.

Accidentals belong to written pitch rather than MIDI input spelling guesses. Renderers track accidental state within a measure so the fixture's F-natural explicitly cancels its earlier F-sharp. A cross-bar tie continues the existing sounding note rather than starting a new gesture. Renderer behavior is tested separately from structural validation.

## Shared proof and regression data

The canonical `First Sketch` fixture includes chord symbols, notes and rests, sharp/natural cancellation, a flat, dotted notes, a dotted rest, and two cross-bar ties. Both clients use this single JSON source. Android copies it into application assets during its build; the web and API use the contracts package's fixture export.

The shared conformance matrix covers unknown fields, incorrect numeric types, bounds, duplicate IDs, ordering, overlap, out-of-bar durations and malformed ties, alongside chord-only and incomplete melody examples. String limits count Unicode code points in both implementations, not UTF-16 storage units. JSON numbers such as `1.0` are integers when mathematically integral; numeric strings remain invalid.

[Chord recognition expectations](../../tests/fixtures/music/chord-recognition-cases.json) preserve useful old behavior for later MIDI authoring work without retaining the old application. They distinguish major/minor qualities, account for omitted fifths, remove octave duplicates and preserve the lowest played bass. They do not claim that a new recognizer has been implemented in M2, and do not preserve the old lowercasing or slash-parsing mistakes.

## Local API

| Endpoint | Result |
| --- | --- |
| `GET /health` | `{ "status": "ok", "service": "chordviewer-api", "apiVersion": "1" }`. This reports API availability, not database readiness. |
| `GET /api/v1/score-example` | The canonical `LeadSheet` object, validated before serving and serialized using the shared schema. |

The server binds to `127.0.0.1:3000`. There are no score write endpoints, account records, credentials, database connections or implicit cross-origin access. The development web server can proxy the local API. NAS deployment and public exposure remain later milestones; account access and persistence belong to M3.

The contracts package builds to JavaScript and declarations under its ignored `dist` directory. The API's production command runs compiled JavaScript with Node. Development uses the root workspace's TypeScript runner. The shared fixture is an exported package asset, so the API does not read arbitrary repository paths at runtime. Root development/build commands build contracts before the clients that import it.

Run the root `npm run test:run` for contract, API and web tests. The contract tests consume the shared conformance matrix; API tests use Fastify's in-process request injection and do not need a listening port. Android runs the same JSON validity cases through its native reader. See [local MIDI testing](local-midi-testing.md) for the separate real-driver/emulator path.
