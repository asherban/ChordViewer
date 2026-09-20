# Rebuild milestones

Planning baseline: 2026-09-20. This is an outcome-level roadmap based on the [product plan](product-plan.md) and [setup and cleanup plan](setup-and-cleanup.md). It does not assign dates or low-level tasks. **M0–M3 are complete.** See the [M1 verification record](../development/m1-verification.md) for tooling, [M2 verification record](../development/m2-verification.md) for the foundation and notation proof, and [M3 verification record](../development/m3-verification.md) for accounts, persistent libraries and container lifecycle acceptance. M4 onward remain planned.

Both web and native Android are part of the product. A milestone involving a user workflow is complete only when it works on both clients, unless explicitly described as a tooling milestone.

Routine acceptance uses the local browser and Android emulator with loopback MIDI. A piano and tablet are not required. See [Local MIDI testing](local-midi-testing.md) for verified coverage and the later product scenarios still to implement.

Develop and test the backend, database, web client and Android emulator on the development machine through M7. NAS deployment is deferred to M8, after the complete workflow has passed local validation.

| Milestone | Outcome | Completion criterion |
| --- | --- | --- |
| **M0 — Repository planning baseline** | The design discussion becomes a durable reference. | Product decisions, setup/cleanup plan, relevant mockups and this roadmap are available under `docs/architecture/`. **Complete.** |
| **M1 — Local development and MIDI testing** | Both clients can be developed and tested on this computer. | Android tooling builds and runs a minimal native app in a tablet-shaped emulator. LoopBe1 input reaches the web app directly and the native app through a local debug bridge; notes, sustain and bridge reconnect are verified. The setup requires no physical piano or tablet. **Complete.** |
| **M2 — Clean project foundation** | The old project is replaced by a maintainable foundation for three application parts. | A recoverable baseline preserves relevant prior work; obsolete code/configuration is retired; web, API and Android have clear boundaries and build checks. The score/API contract and notation approach are agreed and shown to work on both clients. **Complete.** |
| **M3 — Local backend and persistence** | Both clients use one persistent backend on the development machine. | A repeatable local container setup runs the backend and database; basic account access and sheet storage work from the local browser and Android emulator. Each new user's library starts empty, and test data persists across service restarts and updates. **Complete.** |
| **M4 — Create chord sheets from MIDI** | The first usable authoring workflow is ready for private use. | On either client, the user can create a chord sheet, link a tutorial, automatically insert MIDI input, undo/change/delete entries, and save/reopen it. Repeatable local MIDI scenarios exercise entry timing, duration selection and input recovery. |
| **M5 — Melody and additional input methods** | Lead sheets can include editable melody, with input beyond MIDI. | Separate chord and melody passes, the agreed notation scope, direct editing and the agreed import format work on both clients. Chord-only sheets remain usable. |
| **M6 — Library and Practice** | Users can manage their sheets and practice with them. | Personal sheets/imports are findable and editable from Library. Practice offers manual movement, optional advance on a matching chord, live MIDI feedback and independent tutorial playback; playing does not change the sheet. |
| **M7 — Complete local validation** | The complete workflow is dependable under repeatable local testing. | Browser and native emulator tests cover creation through practice, temporary connection loss and the agreed draft/sync behavior against the local backend. Backup restoration, repeatable container releases and resource usage are checked locally. Hardware-specific behavior not covered by this setup is documented separately. |
| **M8 — Private NAS deployment** | The locally validated product can run on a separate private host. | Compatible release containers run on the NAS with separate settings and data. Both clients reach the private deployment; updates, persistence and backup restoration are verified. Deployment resource measurements inform the later hosting choice. |
| **M9 — Small paid public launch** | The product can serve and charge an initial public user base. | A reviewed hosting choice runs the compatible container deployment within an accepted budget. Account isolation, paid access, Android distribution, production backup/restore and service operation are validated before public access. |

## Sequence and release boundaries

The main sequence is M0 through M9. Preservation precedes repository cleanup, and a working local MIDI test path precedes building the full editor. NAS availability is not a dependency of M1–M7. Focused setup and design work can overlap where it does not depend on an unresolved decision.

- **First usable private alpha:** M4, for MIDI chord-sheet creation, testable entirely on the workstation.
- **Full planned workflow available for local testing:** M6, including melody, Library and Practice.
- **Complete local validation:** M7, before deploying beyond the development machine.
- **Private NAS deployment:** M8, as a later deployment rehearsal.
- **Ready for public users:** M9, after deployment validation and production preparation. The NAS remains private throughout.

## Decisions needed along the way

| Before completing | Decisions or evidence needed |
| --- | --- |
| M1 | Android emulator/system image, available workstation resources, working loopback input, and the local bridge/debug adapter. |
| M2 | Backend framework, account/authentication approach, native/web notation rendering, initial score schema and compatible toolchain versions. |
| M3 | Working local container runtime, browser/emulator access to the local backend, separate development/test settings and manageable workstation resource use. |
| M4 | Automatic insertion gesture, sustain/overlap handling, duration controls, chord-name alternatives and correction behavior. |
| M5 | Initial melody complexity, import format and minimum direct-editing controls. |
| M7 | Draft recovery and simultaneous-edit behavior, plus acceptance from repeated browser/emulator scenarios. |
| M8 | NAS memory/capacity, DSM/Container Manager state, private HTTPS/access arrangement and deployment-specific settings. |
| M9 | Cloud region/provider, current full hosting cost and reputation, account/subscription model, payment approach and Android distribution channel. |

DigitalOcean and OVHcloud remain hosting candidates, not selections. The USD 10 figure is a hosting target; confirm which operating costs fit within it before committing to a provider or commercial launch.

## Later scope

Sharing/community features, simultaneous melody-and-accompaniment capture, automatic video synchronization and performance grading are outside these initial delivery milestones. Advanced notation beyond the agreed first-release scope can follow later. Migration of legacy browser charts is intentionally excluded: the rebuilt product starts with an empty library.
