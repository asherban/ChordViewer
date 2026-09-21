# ChordViewer rebuild plan

Planning baseline: 2026-09-20. This folder records agreed direction, proposed behavior, implementation decisions and unresolved questions. The milestone roadmap distinguishes working foundations from future product workflows.

| Document | Contents |
| --- | --- |
| [Product and architecture plan](product-plan.md) | Accepted scope, Library/Create/Practice behavior, the three application parts, deployment direction and open decisions. |
| [Development setup and repository cleanup](setup-and-cleanup.md) | Workstation audit, Android tooling, local development, later private NAS deployment, preservation and cleanup boundaries. |
| [Local MIDI testing](local-midi-testing.md) | Verified Windows loopback/web test and the proposed bridge to the Android emulator, without a piano or tablet. |
| [Milestone roadmap](milestones.md) | Delivery outcomes, completion criteria and decisions needed before each stage. |
| [Local development guide](../development/local-setup.md) | Installed Android tools, build commands, emulator and real LoopBe MIDI test workflow. |
| [M1 verification record](../development/m1-verification.md) | Passed builds/tests/reviews, working emulator configuration and native MIDI evidence. |
| [M2 verification record](../development/m2-verification.md) | Clean rebuild, shared notation, web/native MIDI checks, reviews and screenshots. |
| [M3 verification record](../development/m3-verification.md) | Shared account libraries, container persistence, session/isolation checks and native/browser evidence. |
| [M4 chord authoring](chord-authoring.md) | Automatic entry, shared recognition, duration/position rules, correction and capture recovery. |
| [M4 verification record](../development/m4-verification.md) | Real LoopBe chord creation on both clients, full-score persistence, reviews and screenshots. |
| [M5 melody and import rules](melody-authoring.md) | Separate entry passes, direct editing, expanded keys/meters, safe import and JSON export. |
| [M5 verification record](../development/m5-verification.md) | Product tests, real MIDI authoring, import/export, reviews and actual application captures. |
| [Score layout verification](../development/score-layout-verification.md) | Mockup-aligned chord and melody systems, responsive layouts and actual application screenshots. |
| [Backend and persistence contract](backend-contract.md) | Local authentication, sheet revisions, limits, security boundaries and migration policy. |
| [Local backend containers](../development/m3-containers.md) | Start/stop commands, private settings, separate test data and container resources. |
| [Score/API contract](score-contract.md) | Versioned data, notation scope, semantic validation and shared client fixtures. |
| [Implemented foundation](../development/architecture.md) | Web/API/native boundaries, rendering approach and development configuration. |
| [Mockup gallery](mockups/README.md) | Selected layout A, melody notation, creation exploration, Library and Practice images. |
| [Shared application layout](ui-style.md) | Shared web/native style, full-window and full-screen behavior, and current interaction boundaries. |
| [UI alignment verification](../development/m3-ui-verification.md) | Current web/native screenshots and checks for the M3 design follow-up. |
| [Saved mockup prompts](mockups/prompts.md) | Available generation and revision briefs for future design changes. |

## Agreed direction

- Build a small commercial product around lead-sheet creation and practice tools, with a backend, a web client and a native Android tablet client.
- Create sheets directly from a connected digital piano on either client. Start with automatic MIDI step entry, easy corrections and separate chord/melody passes.
- Keep personal sheets and imports in Library. Practice uses manual navigation by default, with optional advance on a matching chord and independently controlled YouTube playback.
- Use the selected balanced layout: tutorial and played-chord feedback on the left, lead sheet on the right. Support chord-only sheets and optional melody notation without lyrics.
- Develop and validate the complete workflow on the local machine first. Deploy privately to the Synology NAS at a later milestone, then move a compatible container deployment to public hosting with an approximately USD 10 monthly hosting target.
- Install Android development tools, preserve a recoverable baseline, remove obsolete repository work and start with an empty user library.
- Use the computer's MIDI loopback setup for routine testing in the web browser and Android emulator. A physical piano or tablet is not a development prerequisite.

## How to read this plan

The product plan distinguishes accepted direction from proposed interaction details. The implementation uses React/VexFlow, native Kotlin/Compose Canvas, Fastify, PostgreSQL and Better Auth. Chord and melody authoring contracts record the M4/M5 decisions, including MusicXML and JSON import. Cloud provider and billing remain open. The milestone roadmap includes those later decision points.

Mockups are layout references, not specifications for every label or music glyph. The older Create image still contains an **Insert** button; the later decision to insert automatically takes precedence. The gallery explains this difference beside the image.

The old active client has been replaced by the three-part foundation, account libraries and score authoring. The [root README](../../README.md) contains developer commands, and the [local development guide](../development/local-setup.md) records the installed hardware-graphics setup. A private baseline preserves removed work. Deployment remains deferred.

All mockup assets and internal document links are stored within the repository. Update this folder as decisions are made so future implementation work uses the same plan.
