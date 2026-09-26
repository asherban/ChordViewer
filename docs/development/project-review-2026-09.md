# Project review — September 2026

## Scope and approach

Reviewed the shared score contracts, web client, API and database boundaries, native Android client, product tests, CI, container configuration, and development/backup tooling. The application reviews ran independently and were reconciled against shared behavior. Existing local M6/M7 commits were preserved; review changes are on `codex/project-review` above M7.

The order of work was: reproduce data-loss and validation problems; fix them with product regressions; simplify demonstrated dependency and duplication problems; measure coverage; then run the combined checks. Development-only scripts and debug transport received static review, not automated test suites, as required by `AGENTS.md`.

## Findings addressed

| Priority | Finding and consequence | Change and evidence |
| --- | --- | --- |
| P1 | Renaming the currently open dirty sheet in web Library reset its draft and deleted the local recovery copy, despite the confirmation promising to retain it. | Start a new workspace writer after successful rename. An App regression reproduces the lost copy and now verifies retention. |
| P2 | A malformed local recovery record prevented listing every valid copy for that account. | Validate records independently, expose the unreadable count alongside valid copies, and preserve damaged records. Real storage regression coverage checks that recoverable work remains usable. |
| P2 | Restoring a draft or reopening a bookmark clamped a valid next-bar authoring cursor back into the previous bar. | Preserve the virtual next bar in web and Android; regressions restore and insert at the intended position. Native cursor bounds now share one helper. |
| P2 | Web favorite/Draft changes while the editor was inactive advanced the saved revision without notifying recovery, producing a false conflict after restart. | Notify recovery subscribers when the saved base changes, preserving music/history. The inactive-workspace regression failed before the fix. |
| P2 | A 404/409 for Android Library item B marked the unsaved open item A conflicted and disabled its Save. | Carry the affected sheet ID through request error handling; unrelated errors retain their message without blocking the current draft. |
| P2 | Android backgrounding disarmed capture but left the UI showing MIDI entry as armed. | Publish a paused editor state on backgrounding; explicit restart remains required. |
| P2 | NUL in score text and unpaired UTF-16 surrogates in score/title text passed validation but PostgreSQL rejected them, returning 503 for invalid input. | Reject unpersistable text in both JSON schemas, API title validation and the native score reader. Shared v1/v2 fixtures preserve valid supplementary Unicode. API regressions verify 400 responses and unchanged stored data. |
| P2 | The API dropped Better Auth's `X-Retry-After` header; live verification also exposed a text-valued PostgreSQL BIGINT timestamp producing an enormous retry interval. | Normalize the header and use a pool-local safe-integer parser without changing pg's global types. Cover both provider header forms, timestamp arithmetic/precision limits, and the live throttling response. |
| P2 | A fresh practice-props object on every MIDI render repeatedly scrolled the score even when the target did not move. | Depend on the target bar/chord identity; a regression confirms one scroll per target change. |

No additional confirmed critical or high-severity exploit was identified in the reviewed application paths. That finding is limited to this source review and the checks recorded below; it is not a penetration-test certification.

## Architecture and sharing changes

- The contracts public barrel now only exports modules. Score primitives and validation have separate modules, and internal implementations import direct dependencies. This removes runtime cycles between the barrel, music settings, entry and practice code while preserving the package API.
- Pitch equality and tick calculations have one implementation. Native cursor clamping, API revision validation, and the web's local `SelectedSheet` type are also shared instead of duplicated.
- The metadata request DTO is now exported and used by the API. The unused native quarter-note-only position label was removed.
- Unused-local/parameter compiler checks now apply to contracts and API as well as web. This catches dead implementation code without deleting public exports merely because a text search finds few references.
- Added `npm run test:coverage`, including untested product source files. CI publishes the coverage artifact. Container installs skip the redundant implicit audit; the explicit CI audit remains separate.
- Updated the backend contract documentation to match current Library, Trash, Practice and recovery behavior.

## Security assessment

The API uses parameterized owner-scoped SQL, guarded revisions, an owner lock for concurrent quota enforcement, signed native bearer credentials, and explicit browser origin checks. HTTP boundary tests now run without Docker and exercise request origin/Fetch Metadata checks, cookie/native write policy, token stripping, renewal cookies, spoofed forwarding headers, allowlisted auth routes, size/type limits and redacted failures. Real database tests remain necessary for SQL ownership and transaction semantics.

Both importers bound input and reject DTD/entity declarations. React text rendering does not interpolate user music as HTML. Tutorial navigation is constrained, native WebView file/content access is disabled, native sessions remain in memory, and the debug MIDI transport is excluded from release. The container publishes only loopback API ports and runs the API as an unprivileged user with a read-only filesystem; private backend settings and backup paths have explicit access/path checks.

Public hosting remains an explicit later milestone. Before changing the loopback restriction, implement HTTPS/secure cookies, deployment-origin policy, account recovery/verification or restricted enrollment, a global account/storage admission policy, and operational monitoring. A per-account 100-sheet quota does not bound total resource consumption when registration is open. These are deployment requirements, not changes silently applied to the current local account workflow.

The standalone npm advisory audit required permission to send dependency metadata to npm and was blocked by automatic approval review pending that permission. No dependency version upgrades were made based on unverified advisory assumptions. A source scan found no matches for the selected private-key, AWS access-key, GitHub-token and live-secret patterns in the non-generated project files; this is not a complete credential scan.

## Validation and coverage

| Check | Result |
| --- | --- |
| TypeScript product unit/contract tests | 378 passed across 26 files. |
| Unit coverage | 72.62% lines, 65.95% branches, 67.05% statements, 61.36% functions. Shared contracts: 96.56% lines, 94.51% branches. |
| ESLint and TypeScript/production builds | Passed for contracts, API and web. Vite reports the large bundle noted in the follow-up plan. |
| API/PostgreSQL integration | 16 passed, including ownership, concurrent writes/quotas, input rejection and live authentication throttling. |
| Persistence/session lifecycle | 5 passed, including database/API restart, container rebuild/recreation with the existing volume, renewal, expiry and revocation. |
| Browser acceptance | 24 passed; 5 physical-MIDI tests skipped because hardware verification was not enabled. |
| Android JVM product tests | 90 passed; no failures, errors or skips. |
| Android lint and packaging | Debug lint, release vital lint, debug APK, instrumentation APK and release APK passed. |
| Android real recovery storage | 3 focused instrumentation tests passed on the local Android 15 (API 35) emulator, exercising corruption isolation, compare/delete and failed AtomicFile writes. |
| Dependency advisory audit | Standalone audit blocked pending permission to submit dependency metadata. |

The coverage report measures TypeScript unit/contract tests only. Browser acceptance, real PostgreSQL integration and Android tests are separate; a zero unit percentage on persistence or a form is not proof that its acceptance flow is untested. Native UI acceptance beyond the focused storage checks and physical USB/Bluetooth/Samsung device verification were not run in this review.

The shared score and musical editing logic has strong unit coverage. The largest remaining measurement gaps are browser storage transactions, full score rendering, form orchestration and the database repository; those areas currently rely substantially on acceptance/integration tests. Keep those suites in CI rather than replacing them with implementation-mirroring mocks. No arbitrary aggregate coverage threshold was introduced before establishing a stable baseline.

## Follow-up plan

| Order | Improvement | Scope and completion criterion |
| --- | --- | --- |
| 1 | Split native Library orchestration | Extract recovery coordination and practice state from `LibraryViewModel`, preserving account/request fencing and MIDI ordering. Keep the existing product regressions green and run native recovery acceptance after each extraction. |
| 2 | Split web workspace presentation | Extract Library filters/cards and practice/tutorial/export controls from `App`/`SheetWorkspace` behind stable callbacks. Preserve writer identity, unsaved-work prompts, dialog focus and score selection in browser tests. Avoid moving the whole state model in the same change. |
| 3 | Remove dual native score state | Replace independently stored `SavedSheet.score` and `scoreJson` with serialization derived at the I/O boundary. Verify imports, rename, Save, recovery and API round trips before removing the redundant field. |
| 4 | Measure and reduce eager work | The current web production bundle is about 1.16 MB minified / 521 kB gzip. Investigate loading the notation renderer only when needed. Profile large native drafts: recovery currently serializes whole scores and reads up to 20 full baseline/draft records after writes. Measure before introducing coalesced writes or metadata-only listings, preserving confirmed-write guarantees. |
| 5 | Extend failure-path storage testing | Extend the new real AtomicFile corruption, compare/delete and failed-write tests to interrupted writes and failed renames. Add browser IndexedDB abort/version-change tests alongside existing multi-tab acceptance. Assert recoverability and honest status messages rather than only successful calls. |
| 6 | Unify remaining cross-client rules | Expand language-neutral fixtures for MIDI framing, text/URL normalization and limits; share TypeScript policy constants where appropriate. Keep Kotlin native, with fixtures establishing semantic parity rather than introducing an FFI layer. |
| 7 | Measure native coverage and broader acceptance | Add a native coverage report, schedule emulator product acceptance separately from fast JVM CI, and retain explicit physical USB/Bluetooth/Samsung verification as unproven until tested. |
| 8 | Prepare public deployment | Complete the hosting security requirements above, verify dependency advisories with authorized registry access, and pin third-party CI actions to reviewed immutable revisions. |

These follow-ups are staged refactors or deployment work. The present changes prioritize reproduced defects and bounded improvements; they do not redesign the entire UI or replace working subsystems without a demonstrated benefit.
