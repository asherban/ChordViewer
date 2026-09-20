# ChordViewer: development setup and repository cleanup

Planning date: 2026-09-20. This page preserves the original setup audit and cleanup plan. Implementation has begun; see the [local development guide](../development/local-setup.md) for installed tools and executable commands.

Implementation update: M1 is complete. Android Studio, JDK 21, SDK 35 and an accelerated tablet AVD are installed; native builds and real emulator MIDI acceptance pass. Use the host-graphics configuration in the local guide. A private baseline preserves source and local configuration outside the repository. Verified generated remnants (`.next`, `dist`, Playwright output and TypeScript build metadata) and inactive Supabase temporary metadata were removed after preservation. Active source replacement remains M2 work. Docker's Linux engine is now reachable.

See the [product plan](product-plan.md) for target behavior and the [milestone roadmap](milestones.md) for delivery outcomes. The observations below are a dated audit and should be rechecked when implementation begins.

## Observed workstation state

| Item | Observation |
| --- | --- |
| Operating system | Windows 11 Home, 64-bit |
| Hardware | Intel Core i7-1360P, 16 GB RAM, approximately 322 GB free on C: |
| Android Studio / SDK / JDK | Not found in checked standard directories, installed-program records, or the relevant command paths. A custom/portable installation elsewhere remains possible. |
| Android environment | ANDROID_HOME, ANDROID_SDK_ROOT and JAVA_HOME were not set in the inspected shell. |
| Docker | Docker Desktop 4.41.2 and Docker CLI 28.1.1 are installed; the Linux engine was not reachable during inspection. |
| WSL | Ubuntu is the default distribution, with WSL 2 as the default version. |
| MIDI loopback | LoopBe1 is installed and exposes `LoopBe Internal MIDI` as input and output. An actual note/sustain test passed in the local Chrome web app; see [Local MIDI testing](local-midi-testing.md). MIDIculous 4.1.13 is also installed, but its routing was not changed or tested. |
| Node/npm | Available in the normal user shell through fnm; the restricted tool shell exposes a different Node runtime and did not resolve npm. Standardize the development shell and project runtime. |
| GitButler | Version 0.22.3 is installed but not on the restricted shell PATH. The existing checkout was configured as a GitButler project while adding this documentation; a dedicated documentation branch was created. Rebuild preservation and cleanup are still pending. |

The system reported an active hypervisor, alongside a false firmware-virtualization field. Do not infer a BIOS change is needed from that field alone; validate emulator acceleration only if an emulator is installed.

## Phase 0: preservation and baseline

1. Use the configured GitButler workflow. Refresh the inventory of tracked, untracked and ignored files and any existing unpublished work before changing the application or removing files.
2. Create a dedicated rebuild branch and a recoverable baseline. Preserve uncommitted work explicitly; Git history alone does not preserve untracked files or local edits. Keep a private backup outside the repository for local configuration and any otherwise unrecorded material.
3. Start the rebuilt product with an empty library, as selected by the user. No legacy chart importer or browser-data migration is required. Existing browser storage is outside repository cleanup; an empty new library does not require erasing it.
4. Record the current domain (`chordviewer.app`) and deployment arrangement. Repository cleanup does not entail deleting a hosted site, changing DNS or deleting provider accounts.
5. Preserve the license, ownership notices, useful product assets and the planning work now stored under `docs/architecture/`, including mockups and generation briefs.
6. Capture existing meaningful musical behavior as reference cases before retiring source files. Candidate cases include seventh chords with omitted fifths, octave deduplication, slash-chord matching and notation spelling. Review each expected behavior against the new product instead of freezing historical bugs.

The target is a clean active tree, with the previous implementation recoverable from history or a private backup rather than a permanent legacy application inside the new tree.

## Phase 1: Android tool installation

### Install and configure

- Install the current stable Android Studio for Windows from Google's official distribution. Record the installed version rather than relying on an unpinned latest version in future setup steps.
- Install the Android SDK platform and Build Tools needed by the selected project, SDK Command-line Tools, SDK Platform-Tools (including adb), Android Emulator and a compatible system image. Record the exact selected components in the setup guide.
- Use Android Studio's bundled JetBrains Runtime for Studio. Choose a compatible build JDK and use the same version from Studio, the terminal and CI; the bundled JDK may satisfy this, but compatibility with the selected Android Gradle Plugin and Gradle must be checked.
- Include the Gradle wrapper in the repository and pin the compatible Gradle, Android Gradle Plugin and Kotlin versions. A separate global Gradle installation is unnecessary for the project workflow.
- Configure the SDK path and relevant command paths for the user development shell. Keep machine-specific SDK locations out of committed files.
- Samsung's Windows USB driver is not needed for the emulator workflow; it is only relevant if physical-tablet debugging is added later.
- Plan a native Kotlin application, with Jetpack Compose as the proposed UI toolkit. C++/NDK tooling is not part of the initial setup unless a later selected dependency requires it.

Sources: [Android Studio installation](https://developer.android.com/studio/install), [JDK selection](https://developer.android.com/build/jdks), [Samsung USB driver](https://developer.samsung.com/android-usb-driver).

### Use the local emulator and loopback MIDI for initial testing

- Create an Android virtual device with a landscape tablet layout. Neither the Samsung tablet nor the RP102 is needed for routine development tests.
- Use the installed LoopBe1 port for generated notes, chord sequences and sustain events. The existing browser app already receives this input through Web MIDI.
- Add a Windows MIDI-to-network test bridge and a debug-only native input adapter for the emulator. Feed the real native MIDI parser/state logic, rather than setting chord labels or editor state directly. This is proposed work, not an existing emulator capability.
- With 16 GB workstation RAM, start with one accelerated emulator and measure responsiveness alongside the local backend/database. Tune resource allocations and run only the services needed for the current test. Defer NAS deployment until the later deployment milestone.
- Validate Windows Hypervisor Platform acceleration and its coexistence with the existing WSL/Docker setup. Do not change virtualization features or reboot as a side effect of a documentation step.

See [Local MIDI testing](local-midi-testing.md) for the routing design and limits. Sources: [Emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration), [Emulator limitations](https://developer.android.com/studio/run/advanced-emulator-usage).

### Verify the installation

The tooling milestone is complete when:

1. The minimal native application builds with the checked-in Gradle wrapper and selected build JDK in a normal terminal. Android Studio uses the same project and JDK configuration; record any graphical IDE import/build checks separately from this repeatable build acceptance.
2. The debug application installs and launches in the local tablet-shaped emulator, with logs available.
3. A local sender drives LoopBe1 and a bridge carries its events into the native application's debug input adapter.
4. A small MIDI diagnostic screen receives note-on, note-off and sustain events, and recovers from bridge disconnect/reconnect without stuck notes. Equivalent events reach the web client through its normal Web MIDI input.
5. Once the local backend milestone is available, both clients can reach it on the development machine. This integration check does not block the earlier toolchain and loopback MIDI checks.

The local setup covers application behavior. It does not establish USB/Bluetooth MIDI compatibility, hardware latency, cable/power behavior or Samsung-specific behavior; those remain unverified rather than prerequisites for this test plan.

## Phase 2: clean repository structure

Proposed structure:

```text
apps/
  web/
  android/
services/
  api/
contracts/
infra/
  compose/
scripts/
tests/
  fixtures/music/
docs/
  architecture/
    mockups/
  development/
```

- `contracts` holds the versioned API/score schema. Web and Kotlin clients can consume the same contract without pretending that TypeScript modules run natively on Android.
- Music fixtures describe expected input/output behavior for both clients; selected web logic may also be ported or reused where appropriate.
- Compose configuration starts with local backend/database services and persistent test data. Keep release containers portable, with separate settings for the later NAS and VPS deployments.
- Setup scripts and documentation provide a repeatable path for checking prerequisites, starting development, launching the emulator and MIDI bridge, and installing a debug Android build.

### Cleanup inventory

| Existing item | Proposed treatment | Reason or condition |
| --- | --- | --- |
| `.git`, license and notices | Preserve | Maintain project history and ownership. |
| `src/lib/chordDetect*`, `chordMatch*`, `notation*`, `youtube*` | Review and preserve useful behavior/tests; port or reuse selectively | These contain relevant music and tutorial behavior. Existing implementation details are not requirements. |
| `src/lib/midi.ts`, history/input behavior | Use as a web reference; implement and verify native equivalents | Direct piano input remains central. |
| `src/App.tsx`, old Learn/Transcribe/Play components and styles | Retire once baseline/reference cases are captured and the new structure is ready | Replace with the agreed Library/Create/Practice model. |
| `src/lib/leadSheet.ts` | Replace; no legacy chart migration is required | The old chord-string grid lacks melody events, explicit durations and account-backed persistence. |
| `public/favicon.svg`, `public/icons.svg` | Review for reuse | Existing branding may still be useful; assets are not automatically obsolete. |
| `public/CNAME` | Record the domain, then remove from the new build when Pages deployment is retired | Domain ownership remains useful; the file is specific to the old hosting workflow. |
| `gh-pages` dependency and `deploy`/`predeploy` scripts | Remove when the deployment transition is made | The new deployment path uses containers. |
| `CLAUDE.md` | Replace obsolete deployment instructions | It currently directs automatic publication after code changes/pushes, which conflicts with the planned controlled deployment workflow. |
| `.claude/skills/architecture-docs/SKILL.md` | Rewrite or retire | It contains automatic commit/push/deploy steps and old repository assumptions. Retain useful documentation practices separately. |
| `.claude/settings.local.json` | Review individually | It is local tooling configuration; do not indiscriminately discard preferences. |
| `.github/workflows/ci.yml` | Replace or expand for the new structure | Current CI only runs the old web tests. New checks must cover relevant web/API/Android builds and tests. |
| `README.md`, `docs/development/architecture.md` | Rewrite for the new product and setup | Current documents describe the browser-only application. Old versions remain recoverable. |
| `.next/` | Remove after verifying generated-only status and repository ownership | Next.js output remains even though the current app uses Vite. |
| `dist/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo` | Remove generated output; ignore future outputs appropriately | Build and test artifacts should be regenerated. |
| `supabase/` | Candidate for removal after preservation checks | Inspected contents were `.branches`, `.temp` and an empty `snippets` directory; no active source integration was found in the inspected application files. This does not authorize changes to any remote Supabase project. |
| `node_modules/` | Recreate after finalizing the new dependency manifests | Generated dependencies belong to the previous package layout. |
| Root package/config files and lockfile | Rewrite/move deliberately with the new structure | Keep only dependencies and tooling actually used by the new web/API projects; regenerate and retain the resulting lockfile. |
| `.env*.local` | Review privately, preserve any needed values, retire obsolete settings selectively | These may hold credentials. Never paste them into plans or commit them; create fresh example files with placeholders. |

The documentation-time GitButler inspection found existing uncommitted local configuration and generated output, including `.next/`, test reports and Supabase temporary files. These were left untouched. Refresh the complete tracked/untracked/ignored inventory and confirm ownership and recoverability before implementing cleanup. Review each candidate against that inventory before removing it.

All recursive removals must use verified absolute paths within this repository, with PowerShell end to end. Do not use a blanket clean/reset or remove `.git` to start over. Cleanup does not include global developer tools, unrelated projects, NAS data or remote cloud resources.

## Phase 3: repeatable local development

- Restore a working Docker Desktop Linux engine on the development machine and verify Compose. Run the backend and database locally alongside the web client and Android emulator.
- Pin the project's Node version and package-manager expectations so normal terminals, editor tools and CI resolve the same toolchain.
- Add a prerequisite check that reports Node, Docker, JDK, SDK and device availability with concrete corrective guidance.
- Provide a simple documented start workflow for the backend/database and web client, plus an emulator build/install and MIDI-loopback test workflow.
- Use independent development/test databases and environment values. Include schema migrations and optional original sample fixtures for diagnostics; do not automatically populate a new user's empty library.
- Make the local backend reachable from the development browser and emulator using their appropriate host connection. The local browser smoke test uses a loopback origin; no NAS connection is needed for this stage.
- Use development-specific Android backend configuration and signing. Keep production credentials and signing material outside the repository.
- Document clean-checkout setup, rebuilding containers, database backup/restore and installing a new debug app version.

## Later stage: private NAS deployment

After the complete workflow passes local validation (M7), deploy compatible release containers to the NAS (M8). At that point, verify NAS capacity and Container Manager, configure separate credentials/data and private HTTPS access, and check updates and backup restoration. Public hosting follows in M9. NAS setup is not an early development dependency.

## Recommended execution order

1. Preserve the baseline and local work/configuration. The new user library starts empty.
2. Install Android tooling and prove the loopback-to-emulator bridge with a minimal native app; retain the already verified direct browser MIDI path.
3. Establish the new repository layout, reference music cases and build checks.
4. Remove the identified obsolete code/configuration and generated remnants as coherent, reviewable changes.
5. Run the backend and database locally and connect both a minimal web client and native Android emulator client.
6. Implement the core automatic-entry/undo/change workflow, followed by Library and Practice.
7. Complete local workflow, recovery and release validation before deploying compatible containers to the NAS for private deployment testing.

Tool installation and repository cleanup are prerequisites for the rebuild, not reasons to change the accepted product scope.

## Remaining information

- Selected emulator profile/system image and memory allocation. Exact Samsung model, Android version and cable/adapter matter only to later hardware-specific validation.
- DS224+ installed RAM and DSM/Container Manager state, deferred until the NAS deployment milestone.
- Final backend framework, SDK/minimum Android version and compatible toolchain versions at implementation time.

## Documentation lookup note

Context7 resolved the Android Developers Guide but returned no setup matches for the query. Its installed CLI did not recognize `--research`. This plan therefore uses the linked official Android and Samsung documentation for tool and device setup.
