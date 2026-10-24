# Architecture decision records

ADRs record decisions and reasons. Detailed designs and implementation evidence remain in [architecture](../architecture/README.md). Use the [project ADR skill](../../.agents/skills/architecture-decisions/SKILL.md) when adding a record.

Numbered ADRs are immutable after their first commit. This index is editable: add new records here and show replacements or corrections with links in both records' rows. A later ADR links back to the earlier one; do not edit the earlier ADR to add a backlink. Numbers follow recording order, not historical decision dates.

| ADR | Decision | Current standing / later records |
| --- | --- | --- |
| [0001](0001-retain-current-backend.md) | Keep the current backend; defer Firebase | Accepted; reaffirms 0002, 0003 and 0007 |
| [0002](0002-native-clients-and-rest-backend.md) | Separate web, native Android and REST backend | Accepted; reaffirmed by [0001](0001-retain-current-backend.md) |
| [0003](0003-local-first-development-and-portable-deployment.md) | Validate locally, then deploy portable containers | Local validation and portability remain accepted; the NAS/later-public sequence is superseded by [0015](0015-public-hostinger-deployment.md) |
| [0004](0004-versioned-score-contract.md) | Share a versioned score contract across clients | Accepted; extended by [0010](0010-structured-harmony-and-logical-chords.md) |
| [0005](0005-midi-step-entry.md) | Use MIDI step entry with separate authoring lanes | Accepted; live feedback is distinguished in [0012](0012-android-practice-and-sounding-notes.md) |
| [0006](0006-musicxml-and-json-import.md) | Import MusicXML and exchange canonical score JSON | Accepted |
| [0007](0007-local-recovery-and-explicit-save.md) | Keep local recovery separate from explicit server Save | Accepted; reaffirmed by [0001](0001-retain-current-backend.md) |
| [0008](0008-persistent-android-sessions.md) | Persist Android sessions securely across restarts | Accepted; endpoint isolation is covered by [0011](0011-development-and-release-endpoints.md) |
| [0009](0009-native-usb-midi.md) | Use native USB MIDI and automatic input selection | Accepted |
| [0010](0010-structured-harmony-and-logical-chords.md) | Store structured harmony and logical cross-bar chords | Accepted; extends [0004](0004-versioned-score-contract.md) |
| [0011](0011-development-and-release-endpoints.md) | Select development endpoints at build time and guard releases | Accepted; the public M8 target is defined by [0015](0015-public-hostinger-deployment.md) |
| [0012](0012-android-practice-and-sounding-notes.md) | Advance Android Practice on completed gestures; show sounding chords | Accepted; metronome remains future work |
| [0013](0013-immutable-architecture-decisions.md) | Keep short, linked, immutable decision records | Accepted |
| [0014](0014-private-vpn-access-for-m8.md) | Reach the private NAS from home and remotely through a VPN | Superseded by [0015](0015-public-hostinger-deployment.md); this deployment was not implemented |
| [0015](0015-public-hostinger-deployment.md) | Deploy M8 publicly on Hostinger VPS; defer commercial launch | Accepted; supersedes [0014](0014-private-vpn-access-for-m8.md) and the deployment sequence in [0003](0003-local-first-development-and-portable-deployment.md); first-release boundaries are recorded in [0016](0016-first-public-release-boundaries.md) |
| [0016](0016-first-public-release-boundaries.md) | One HTTPS origin and operator-managed enrollment for the first release | Accepted; extends [0015](0015-public-hostinger-deployment.md) and [0011](0011-development-and-release-endpoints.md); recovery and full M8 acceptance remain pending |
| [0017](0017-compile-score-validators-at-build-time.md) | Compile shared score validators at build time | Accepted; supports the strict browser CSP in [0016](0016-first-public-release-boundaries.md) while preserving [0004](0004-versioned-score-contract.md) |

## Historical sources

Records 0002–0012 were written retrospectively on 2026-10-15 from the available project chats and checked against repository contracts. Their decision dates refer to the original discussions; implementation details are not presented as newly approved choices. Records 0001 and 0013 come from the current request.

The review covered all turns available in these 11 earlier project chats, including archived chats:

- [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74)
- [Go over the entire project. Review it. Find oportunitiea for architecture, design and code improvements, make the project more maintainable, find security issues, review code, review test s and test coverage, find opportunities for code sharing and dead code. Plan and fix as needed.](codex://threads/01a0dd36-b61c-7051-9ce5-a2f2e9a490ec)
- [Redesign Android library view](codex://threads/01a0fcaa-6be4-71b2-b831-9f976c378067)
- [Redesign Android landscape views](codex://threads/01a0fd36-679d-7920-ab94-80736c9ef6cd)
- [Design code entry mocks](codex://threads/01a0fe87-f4b5-7e80-9c6e-6229d8cbab90)
- [Plan tablet chord entry redesign](codex://threads/01a102df-9731-7cb0-b8a3-53f695b5b77b)
- [Plan USB MIDI loopback setup](codex://threads/01a10220-5a42-77d1-8805-f6bf4fbbdd59)
- [Update practice MIDI controls](codex://threads/01a10852-bfb6-7442-b08e-6add4ba4c73a)
- [Plan dev host IP connection](codex://threads/01a10853-d035-70a3-8b6e-83e002974dea)
- [Rework playing chord view](codex://threads/01a10843-3fc8-72d3-b0f8-0e36d17d31f3)
- [We want to consider changing the backend to firebase free tier. Analyze, consider the implications, pros and cons, and path to the refactor](codex://threads/01a135df-cdd5-7491-9509-7d009364e114)

Mockup alternatives, routine fixes and unaccepted recommendations are not separate architecture decisions. The Firebase proposal is recorded only as the option declined in 0001. Older milestone documents can describe earlier behavior; the later Android decisions in 0008, 0009, 0011 and 0012 identify those changes without implying identical web behavior.
