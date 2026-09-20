# M3 verification — local accounts and persistence

Verified on this Windows workstation on 2026-09-20. M3 is complete on branch `codex/m3-local-persistence`, stacked above M2. Nothing was deployed to the NAS or a public host. The [README](../../README.md) contains runnable developer commands; the [backend contract](../architecture/backend-contract.md) records the API and security decisions.

## Delivered behavior

The browser and native Kotlin/Compose app use the same local Fastify/PostgreSQL backend. Email/password accounts start with an empty personal Library. Users can create a blank sheet or copy the original example explicitly, reopen its native/web notation, and save title/tutorial changes with revision conflict protection. Both clients preserve failed metadata edits and prevent stale account responses from restoring cleared data. Music entry/editing, imports and full Practice behavior remain M4–M6.

Compose provides separate development and test databases, private generated settings, automatic explicit migrations and retained volumes. The API binds to host loopback and the database has no host port. The previous diagnostic-only API tests were replaced by account/storage tests; the web/native diagnostic preview and real MIDI paths remain useful and were retained.

The README's development start command was also exercised from a fresh development volume while the test project existed. Both services became healthy independently. A post-start idle sample reported approximately **50 MiB for the API and 65 MiB for PostgreSQL**; this excludes Docker Desktop/WSL, the browser, emulator and build overhead. Each service has a 512 MiB memory cap and one-CPU limit. This is a local baseline, not a production capacity estimate.

## Executed checks

| Check | Result and scope |
| --- | --- |
| `npm run check` | Passed lint, **101 unit/contract tests across 9 files**, and contracts/API/web builds. |
| `npm run test:web` | **5 browser acceptance tests passed** against the real test backend: anonymous preview, unavailable backend, separate accounts and reopening in another browser session, real revision conflict, failed save/refresh recovery. |
| `npm run test:api` | **9 integration tests passed**: new empty accounts, validated create, ownership isolation, simultaneous revision updates, malformed/oversized input, trusted-origin cookie writes, signed/revoked native sessions, concurrent quota boundary and spoof-resistant auth throttling. |
| `npm run test:persistence` | **4 lifecycle/session scenarios passed** (5 Node test results including the parent): browser cookie renewal after ageing the fresh test session; database/API restart; rebuild and actual replacement of both containers while retaining their volume; expired and revoked sessions. Password login and saved revision/music remained valid after restarts/replacement. |
| Android final Gradle check | Debug, release and instrumentation APKs built; **38 JVM tests passed**; lint reported **0 errors, 12 warnings**. |
| Android backend instrumentation | **1 opt-in integration test passed** on the final APK: registration, empty library, blank/example creation, save/canonical tutorial, stale revision rejection, cross-account denial, relogin persistence and revocation. No skip counted as a pass. |
| Native UI cross-client acceptance | A separate HTTP-created account/sheet was opened and edited in the native UI. Metadata survived Library → MIDI → Library; Back requested discard confirmation. Saving produced revision 2. An independent HTTP login read the exact native-saved title and canonical tutorial URL. Force-stop/relaunch returned to sign-in as required by memory-only credentials. |
| Real browser MIDI | Installed Chrome received the actual LoopBe fixture. Held C major remained held while saving metadata; sustain, zero-velocity note-off, channel separation and final clear passed. Saved music remained unchanged. |
| Real native MIDI | **1 opt-in test passed** through LoopBe → authenticated local bridge → emulator on the final APK, covering notes, sustain, channel identity and disconnect/reconnect reset. |
| Dependency audit | `npm audit --audit-level=high` reported **0 vulnerabilities**. Production Docker dependency installation also reported 0 at verification time. |
| Configuration checks | OpenAPI, Compose and CI YAML parsed; backend PowerShell scripts parsed. Official Better Auth migration planning against the populated database found no missing schema changes. |

The final web build retains VexFlow's existing large-bundle warning. Android lint warnings concern dependency/target-version updates and other existing build advice; they are not failed checks. The build also emits the existing SDK XML-version warning. Before public launch, review target SDK, dependencies and bundle delivery again. The edited GitHub Actions workflow has not run remotely in this local-only milestone; its equivalent local build/browser/API commands passed. The Windows container lifecycle and real MIDI suites are workstation checks.

## Review and resolved findings

Code and security reviews covered the API, migrations, container settings, client session lifetime, native networking and save behavior. Separate agents reviewed the API/backend boundary and the native client; the integration review covered the web and infrastructure changes.

Findings fixed before completion included exact template-enum validation, forwarding renewed browser cookies, retaining client drafts during view changes and failures, distinguishing an unavailable library from an empty one, avoiding a full MIDI remount after a metadata save, bounding the complete browser request lifetime, and distinguishing native quota errors from revision conflicts. Regression checks cover these cases. No actionable review findings remain within M3's local scope.

The API never accepts caller-selected ownership, uses parameterized SQL, rejects other-account records as not found, and atomically checks revision/quota constraints. Browser tokens are HttpOnly; native tokens are signed, memory-only and excluded from logs. Authentication forwarding headers are overwritten. Redirects and unsupported tutorial URLs are rejected. The API does not fetch tutorial URLs. Generated settings are ignored and protected with Windows ACLs; the Docker build context excludes local credentials and artifacts.

The release manifest permits Internet access for a future HTTPS backend, forbids cleartext and disables Android backups. Release source contains neither the debug relay transport nor a configured local API origin; inspection of the final release DEX found no selected debug relay/local-API markers. This is an unsigned local build, not a distribution-ready Android release.

## Evidence

Screenshots were opened and visually inspected. Email addresses shown are synthetic test accounts; no passwords or session credentials are included.

- [Web personal Library](../architecture/evidence/m3-web-library.png)
- [Saved web score and tutorial](../architecture/evidence/m3-web-score.png)
- [Held MIDI chord preserved through save](../architecture/evidence/m3-web-midi.png)
- [Native Library opening the HTTP-created sheet](../architecture/evidence/m3-native-library.png)
- [Native saved metadata at revision 2](../architecture/evidence/m3-native-sheet.png)

## Remaining boundaries

These checks use the local computer and an emulator. They do not establish physical Samsung/Roland USB or Bluetooth compatibility. Android deliberately signs out after process death. Durable offline draft recovery, restore-from-backup acceptance, NAS hosting, public HTTPS, email recovery/verification and commercial access controls remain later milestones. M3 container persistence verifies retained-volume updates, not a backup strategy or a major PostgreSQL upgrade.
