# Implemented foundation

The root [README](../../README.md) is the developer command reference. Product intent and future behavior are in the [architecture plan](../architecture/README.md); this document describes the M2 implementation.

## Boundaries

- `apps/web` is a React client. Library starts empty; Create/Practice currently show a labeled, read-only example. Web MIDI input uses the browser API directly and maintains per-channel held/sounding state. Live notes do not mutate the example.
- `services/api` is a TypeScript/Fastify process exposing health and an immutable example. It binds to `127.0.0.1:3000`; there are no accounts, write endpoints, database connections or storage in M2.
- `apps/android` is a native Kotlin/Compose client. It parses the shared example from packaged assets and draws notation using Canvas and a bundled music font. M1's transport-independent MIDI parser and debug-only relay remain separate from score data.
- `contracts` owns versioned JSON Schema, TypeScript validation, OpenAPI and the canonical example. Android implements the same structural and musical rules in Kotlin. Both validators run a shared conformance matrix.

## Score and rendering

Chord events and one spelled melody voice occupy separate lanes of the same integer-tick measure timeline. The M2 proof restricts key signature to C and meter to 4/4, while supporting sharp/flat/natural spelling, rests, dotted notes and ties. Other keys/meters and authoring are later work. See the [score contract](../architecture/score-contract.md) for limits and invariants.

The web uses VexFlow 5 with bundled fonts; Android uses native Canvas and Bravura. Music never travels through a WebView. The renderers need not share pixels, but must preserve the same pitches, rhythm, spelling, rests and ties. A chord-only display remains available.

## Development and release boundary

The npm workspace pins Node in `.node-version`, keeps one lockfile and builds contracts before their web/API consumers. Vite proxies API calls during local development. Android has its own pinned Gradle/JDK toolchain. CI checks web/API lint, tests, builds and browser acceptance, plus native unit tests/lint/APKs. Real LoopBe testing remains a workstation check.

The selected M3 direction is PostgreSQL with Better Auth email/password and database-backed sessions. Web sessions will use secure HttpOnly cookies; native sessions will use an explicitly reviewed credential store/session flow. Every stored-sheet operation must check authenticated ownership. Authentication, persistence, rate limiting, recovery, and deployment security are not implemented by the M2 diagnostic API.

The previous browser app, automatic Pages publication instructions and starter assets were retired after every removed file was matched to the private baseline. Relevant chord recognition and display behavior survives in focused modules/tests and language-independent fixtures. The domain, license, history, private settings and agreed mockups remain intact.
