# ChordViewer rebuild plan

Planning baseline: 2026-09-20. This folder is the reference for the planned rebuild. It records agreed direction, proposed behavior and unresolved decisions; it does not describe an implemented replacement application.

| Document | Contents |
| --- | --- |
| [Product and architecture plan](product-plan.md) | Accepted scope, Library/Create/Practice behavior, the three application parts, deployment direction and open decisions. |
| [Development setup and repository cleanup](setup-and-cleanup.md) | Workstation audit, Android tooling, local development, later private NAS deployment, preservation and cleanup boundaries. |
| [Local MIDI testing](local-midi-testing.md) | Verified Windows loopback/web test and the proposed bridge to the Android emulator, without a piano or tablet. |
| [Milestone roadmap](milestones.md) | Delivery outcomes, completion criteria and decisions needed before each stage. |
| [Local development guide](../development/local-setup.md) | Installed Android tools, build commands, emulator and real LoopBe MIDI test workflow. |
| [M1 verification record](../development/m1-verification.md) | Passed builds/tests/reviews, working emulator configuration and native MIDI evidence. |
| [Mockup gallery](mockups/README.md) | Selected layout A, melody notation, creation exploration, Library and Practice images. |
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

The product plan distinguishes accepted direction from proposed interaction details. Frameworks, cloud provider, import scope, billing and several MIDI/notation details remain open. The milestone roadmap includes decision points rather than treating these as settled choices.

Mockups are layout references, not specifications for every label or music glyph. The older Create image still contains an **Insert** button; the later decision to insert automatically takes precedence. The gallery explains this difference beside the image.

M0 and M1 are complete: planning, Android builds, unit tests, code/security reviews and real LoopBe input in the native emulator are verified. The [local development guide](../development/local-setup.md) records the working hardware-graphics setup. A private baseline was preserved before removing obsolete generated output; replacement of the old application source belongs to M2. The [existing application architecture](../development/architecture.md) describes the earlier implementation and is not the target architecture. Deployment remains deferred.

All mockup assets and internal document links are stored within the repository. Update this folder as decisions are made so future implementation work uses the same plan.
