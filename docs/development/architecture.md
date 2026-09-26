# Implemented foundation

The root [README](../../README.md) is the developer command reference. Product intent and future behavior are in the [architecture plan](../architecture/README.md); this document describes the implementation through M7.

## Boundaries

- `apps/web` is a React client with same-origin cookie authentication, a personal Library and explicit full-score saving. Web MIDI sends every ordered message to a synchronous score draft store for both entry lanes, independently of React's display updates. Create explicitly arms insertion; Practice and anonymous examples are read-only.
- `services/api` is a TypeScript/Fastify process with Better Auth and PostgreSQL. Every sheet operation scopes queries to the authenticated owner. Revision checks prevent stale saves. Compose publishes only `127.0.0.1:3000` (development) or `127.0.0.1:3001` (test); PostgreSQL has no host port.
- `apps/android` is a native Kotlin/Compose client for the same account, Library and authoring operations, with a session held only in memory. It validates saved scores and draws notation using Canvas and a bundled music font. Ordered MIDI events feed its draft model through a bounded queue; live display updates may be coalesced without losing gestures. The local relay is debug-only.
- `contracts` owns versioned JSON Schema, TypeScript validation, storage DTOs, OpenAPI and the canonical example. Android implements the same structural and musical rules in Kotlin. Both validators run a shared conformance matrix.

## Score and rendering

Chord events and one spelled melody voice occupy separate lanes of the same integer-tick measure timeline. Version 2 supports 30 standard major/minor keys and meters of 1–12 beats over 2, 4 or 8, while retaining v1 C/4/4 reading. Both lanes have MIDI and manual authoring, independent cursors and common bounded history. Changes preserve the other lane and musical timing. See the [score contract](../architecture/score-contract.md), [chord-entry rules](../architecture/chord-authoring.md) and [melody/import rules](../architecture/melody-authoring.md). Both clients use shared vocabulary and conformance fixtures. Chord-only draft/editor modules were replaced by a general score editor; the obsolete Tonal recognizer and dependencies remain removed.

Local bounded JSON/MusicXML parsing is separate from rendering and persistence. Users preview imports before an authenticated import-as-new request. The backend validates canonical score JSON, assigns its identity and applies the same owner transaction lock as blank/example creation. Native documents use system pickers, transient grants, bounded UTF-8 reads, cancellable jobs and request/account fencing. JSON export contains score data only.

The web uses VexFlow 5 with bundled fonts; Android uses native Canvas and Bravura. Music never travels through a WebView. The renderers need not share pixels, but must preserve the same pitches, rhythm, spelling, rests and ties. A chord-only display remains available.

## Development and release boundary

Both clients retain bounded account-scoped recovery snapshots locally and keep server Save explicit. Web uses IndexedDB transactions and independent writer identities; Android uses AtomicFile in its no-backup private directory. Original revisions survive restore, with Save as new or an explicit reload for conflicts. See [draft recovery](../architecture/draft-recovery.md). Library organization and read-only Practice are described in [Library and Practice](../architecture/library-practice.md).

The npm workspace pins Node in `.node-version`, keeps one lockfile and builds contracts before their web/API consumers. Vite proxies API calls during local development. Android has its own pinned Gradle/JDK toolchain. CI checks web/API lint, tests, builds and browser acceptance, plus native unit tests/lint/APKs. Real LoopBe testing remains a workstation check.

The [backend contract](../architecture/backend-contract.md) describes authentication, owner checks, conflict responses, input limits and explicit migrations. API/database containers have separate development/test settings and retained volumes. Windows lifecycle acceptance verifies persistence across restarts and recreation; [local backup/restore](local-backup-restore.md) rehearses private archives in a fresh isolated target. CI starts an isolated container backend for browser/API tests; native API and real LoopBe acceptance run on this workstation. Public HTTPS and email account recovery/verification remain later milestones.

The previous browser app, automatic Pages publication instructions and starter assets were retired after every removed file was matched to the private baseline. Relevant chord recognition and display behavior survives in focused modules/tests and language-independent fixtures. The domain, license, history, private settings and agreed mockups remain intact.
