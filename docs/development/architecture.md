# Implemented foundation

The root [README](../../README.md) is the developer command reference. Product intent and future behavior are in the [architecture plan](../architecture/README.md); this document describes the implementation through M4.

## Boundaries

- `apps/web` is a React client with same-origin cookie authentication, a personal Library and explicit full-score saving. Web MIDI sends every ordered message to a synchronous chord draft store, independently of React's display updates. Create explicitly arms insertion; Practice and anonymous examples are read-only.
- `services/api` is a TypeScript/Fastify process with Better Auth and PostgreSQL. Every sheet operation scopes queries to the authenticated owner. Revision checks prevent stale saves. Compose publishes only `127.0.0.1:3000` (development) or `127.0.0.1:3001` (test); PostgreSQL has no host port.
- `apps/android` is a native Kotlin/Compose client for the same account, Library and authoring operations, with a session held only in memory. It validates saved scores and draws notation using Canvas and a bundled music font. Ordered MIDI events feed its draft model through a bounded queue; live display updates may be coalesced without losing gestures. The local relay is debug-only.
- `contracts` owns versioned JSON Schema, TypeScript validation, storage DTOs, OpenAPI and the canonical example. Android implements the same structural and musical rules in Kotlin. Both validators run a shared conformance matrix.

## Score and rendering

Chord events and one spelled melody voice occupy separate lanes of the same integer-tick measure timeline. The v1 contract restricts key signature to C and meter to 4/4, while supporting sharp/flat/natural spelling, rests, dotted notes and ties. Chord authoring preserves existing melody; melody entry and other keys/meters remain later work. See the [score contract](../architecture/score-contract.md) for limits and invariants and [chord-entry contract](../architecture/chord-authoring.md) for shared gestures, recognition and immutable edits. Both clients use the same vocabulary and conformance fixtures. The obsolete web-only Tonal recognizer and its dependencies were removed.

The web uses VexFlow 5 with bundled fonts; Android uses native Canvas and Bravura. Music never travels through a WebView. The renderers need not share pixels, but must preserve the same pitches, rhythm, spelling, rests and ties. A chord-only display remains available.

## Development and release boundary

The npm workspace pins Node in `.node-version`, keeps one lockfile and builds contracts before their web/API consumers. Vite proxies API calls during local development. Android has its own pinned Gradle/JDK toolchain. CI checks web/API lint, tests, builds and browser acceptance, plus native unit tests/lint/APKs. Real LoopBe testing remains a workstation check.

The [backend contract](../architecture/backend-contract.md) describes the implemented M3 authentication, owner checks, conflict responses, input limits and explicit migrations. API/database containers have separate development/test settings and retained volumes. Windows lifecycle acceptance verifies persistence across restarts and recreation. CI starts an isolated container backend for browser/API tests; native API and real LoopBe acceptance run on this workstation. Public HTTPS, email recovery/verification, offline recovery and backup restoration remain later milestones.

The previous browser app, automatic Pages publication instructions and starter assets were retired after every removed file was matched to the private baseline. Relevant chord recognition and display behavior survives in focused modules/tests and language-independent fixtures. The domain, license, history, private settings and agreed mockups remain intact.
