# Shared score and API contracts

The browser, API and native app validate the same score before editing, rendering, import or persistence. Score version 1 remains strict C major and 4/4. Version 2 adds the 15 standard major and 15 standard minor keys and meters with 1–12 beats over 2, 4 or 8. Both use 480 ticks per quarter; note durations remain absolute, while measure length follows the selected meter. V1 JSON exports remain readable.

`src/lead-sheet-v1.schema.json` and `src/lead-sheet-v2.schema.json` define field shapes; runtime validation also checks IDs, event order, overlap, bar boundaries and ties. The TypeScript implementation lives in `src/index.ts`; native decoding mirrors it in `LeadSheetReader`. Shared fixtures under `tests/fixtures/music` verify the contract on both platforms.

`openapi.yaml` documents authentication and persistence. `POST /api/v1/sheets` creates a blank v2 sheet (optional key/meter, default C/4/4) or preserves the original example's notation. `POST /api/v1/sheets/import` accepts `{score, title, tutorialUrl?}` and atomically creates a new sheet with a fresh server ID. It never targets the source score's ID. Imports share the normal session ownership, CSRF rules, 1 MiB request limit and 100-sheet library cap. The whole JSON envelope must fit the request limit.

Local MusicXML parsing is deliberately narrower than the complete interchange specification. See `tests/fixtures/music/import/README.md` for its supported subset, security bounds and explicit rejection cases. Preview warnings describe metadata that is not retained. Export uses the exact supported ChordViewer score JSON; it does not include account identity, session credentials or the library tutorial URL.
