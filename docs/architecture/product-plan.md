# ChordViewer product plan

Updated: 2026-10-23. Living discussion draft; accepted decisions and proposals are distinguished below.

See the [architecture index](README.md), [milestone roadmap](milestones.md) and [selected mockups](mockups/README.md).

## Accepted direction

- Build a small commercial product that sells practice and lead-sheet creation tools.
- Three parts: backend, web client, and a natively implemented Android tablet client.
- Both clients must support creating lead sheets directly from a connected digital piano, as well as practicing with them. Tablet authoring is a core workflow.
- MIDI is the primary authoring input. M5 also supports direct chord/note/rest editing and local MusicXML or ChordViewer JSON import with a preview before saving a new sheet.
- Step entry is the preferred initial interaction: play a chord or note, place it at the selected score position, then advance.
- Automatically insert played chords or notes on physical release, with easy undo, deletion and correction. Sustain does not delay insertion; overlapping pitches form one chord gesture and are rejected in the single-note melody pass.
- Enter chords and melody in separate passes initially. Support for simultaneous melody/accompaniment capture remains a longer-term goal.
- A YouTube tutorial is linked and played independently while creating or practicing. Automatic synchronization and bar timestamps are not required for the initial workflow.
- Use layout A: tutorial and played-chord preview on the left, lead sheet on the right.
- Explore optional melody notation without lyrics. Keep a chord-only view available.
- Library initially contains each user's own sheets and imports; sharing is a later capability.
- Practice supports manual navigation by default and an optional advance-on-matching-chord setting.
- Develop and test locally, including the backend and database, through M7. M8 deploys the validated product publicly on Hostinger VPS with HTTPS, secured administration and approved-user accounts. The active roadmap ends at M8; commercial launch is deferred.
- Target production hosting budget: approximately USD 10 per month.
- Available client hardware includes the Samsung SM-X610 tablet and Roland RP102 piano. The deployment target is Hostinger VPS; confirm its tier, region and domain before provisioning.
- Include Android development-tool installation and removal of obsolete repository work as explicit preparatory phases of the rebuild.
- Start with an empty user library. Do not build a migration of charts from the previous browser-only application.
- Test locally using the workstation's MIDI loopback setup, with the web client in a desktop browser and the native Android client in an emulator. Testing does not depend on having a physical piano or tablet connected.

## Proposed first complete workflow

1. Open or create a sheet on the tablet or browser and optionally link a YouTube tutorial.
2. Connect the digital piano and confirm incoming notes and sustain events.
3. Select chord entry, a score position, and the desired chord duration.
4. Play a chord and preview its proposed symbol, with alternatives or manual correction if needed.
5. Automatically insert it at the end of the input gesture and advance by its selected musical duration. Holding the keys longer does not change the selected score duration.
6. Switch to melody entry and enter pitches with a selected duration; offer rests, ties, undo and corrections.
7. Save the sheet and switch to practice without changing devices.

The score should remain editable throughout. Proposed chord recognition must not silently overwrite existing score content.

## Creation: proposed correction behavior

- A prominent Undo action removes the last insertion and restores its insertion position; Redo restores it.
- Proposed default input gesture: play the desired chord/note, release the physical keys, insert once, then advance. Sustain state does not extend the selected musical duration. Keep a visible MIDI entry On/Pause control so a user can experiment without writing to the sheet.
- Tapping an existing chord or melody event selects it and exposes Change and Delete actions.
- Change supports direct symbol/pitch/duration editing and an explicitly armed replacement from the piano. A replacement overwrites only the selected event, then exits replacement mode.
- Deleting a chord clears its chord event while preserving the melody and musical timeline.
- Deleting a melody note leaves an equivalent rest initially, preserving the timing of subsequent notes. Removing time or deleting a whole bar is a separate explicit action.
- While inspecting or editing an existing event, normal MIDI auto-insertion pauses so exploratory playing cannot create unwanted entries. The UI shows when MIDI entry is active, paused or replacing an event.
- Provide touch actions on Android and web, plus desktop keyboard shortcuts. Undo/Delete should be easy to reach from the music stand.

## Library: role and behavior

Library is the user's home for finding, organizing and reopening lead sheets.

- Search by title and filter by favorite, draft, notation content and tutorial availability; sort by recently opened or title.
- Each sheet exposes title, key, chord-only/melody status, optional tutorial thumbnail, saved/sync status, and distinct Practice and Edit actions.
- New sheet opens creation with a blank sheet. Import opens a preview so the user can inspect imported notation before saving it as an editable sheet.
- Offer rename, duplicate, favorite and move to a recoverable Trash through each sheet's menu. Avoid an irreversible-delete action on the main card.
- Resume the previous edit position or practice position for the selected sheet.
- Show a useful empty state with New sheet and Import.
- Show only personal sheets and imports for the first release. Sharing comes later; no community/marketplace tab is planned initially.
- Draft describes work in progress, not unsaved data. Local recovery status and explicit server Save remain separate from that designation.
- A library selection and the current sheet persist when switching between Create and Practice. If no sheet is open, either mode should offer a sheet picker; Create should also offer a blank sheet.

## Practice: role and behavior

Practice is for reading and playing an existing sheet with optional tutorial playback and live MIDI feedback. Piano input never edits the saved score in this mode.

- Preserve layout A: tutorial in the upper-left, live played chord below it, and the score on the right.
- Keep the current musical position visible; allow tapping a bar and large Previous/Next controls.
- Offer chord-only and chords-with-melody display, score size, temporary transposition and a larger score view when the tutorial is hidden.
- Keep tutorial playback and its playback-speed controls inside the video panel. No automatic video-to-score synchronization is assumed.
- Practice-only position, transposition and display preferences do not rewrite the authored sheet.
- An Edit sheet action returns to creation at the selected musical position.
- Practice remains usable without MIDI; display connection status and allow reading/navigation normally.
- Manual movement is the default. The user can optionally switch Advance to On match, moving to the next chord event when a fresh played chord matches the current one.
- On match follows chord events, which may be shorter than a bar. A held chord must not skip repeated chart chords; advancement requires a new playing gesture for each event. Manual Previous/Next bar controls remain available for jumping around.
- A current chart chord and a live played chord can be shown together, with a simple match indication. Automatic melody assessment, performance grades and video synchronization are outside the initial proposal.

## Mode transitions

| Starting point | Action | Result |
| --- | --- | --- |
| Library | New sheet | Create mode with a blank sheet and MIDI entry initially paused until connected/armed |
| Library | Import | Import preview, then an editable personal sheet |
| Library | Edit on a sheet | Create mode at its last edit position |
| Library | Practice on a sheet | Practice mode at its last practice position, with manual movement initially selected |
| Create | Practice | Preserve the current draft in memory without auto-saving, pause writing from MIDI, open the same score for practice |
| Practice | Edit sheet | Open the same sheet at the selected musical position in Create, with entry paused until the edit target is chosen |
| Either sheet mode | Library | Preserve current sheet state and return to the user's collection |

These Library/Create/Practice transitions are implemented. Draft content stays in memory across mode changes and M7 retains confirmed local recovery copies across reload/process restart. Updating the shared Library still requires explicit Save.

## Proposed implementation principles

### Application responsibilities

| Part | Responsibility |
| --- | --- |
| Backend | Account-scoped sheet storage and synchronization through a versioned API, with paid access support once the commercial model is decided. |
| Web client | Library, Create and Practice; direct browser MIDI input, local chord recognition and editable score presentation. |
| Native Android client | The same core workflows with native UI, MIDI/device integration and local authoring on the tablet. |

Both clients connect directly to the piano and communicate with the backend for stored application data. The backend does not sit in the live MIDI path. A linked YouTube player has its own playback controls.

### Data and client behavior

- Process MIDI and update the authoring interface locally on each client so note entry does not wait for a backend response.
- Represent chord events and melody events separately on the same musical timeline, with explicit duration, pitch spelling, rests and measure information. The current array of chord strings is insufficient for melody notation.
- Keep live held/sustained MIDI notes separate from saved score events.
- Treat the musical score as editable data, not a picture or PDF. Import the supported MusicXML subset or exact ChordViewer JSON; export score JSON without account or tutorial metadata.
- Use local recovery and explicit Save so a temporary server connection loss does not interrupt creation. M7 preserves complete drafts and their original revisions. After authentication, restore deliberately; conflicts offer Save as new or a confirmed reload. No automatic merge or server autosave is planned. See [draft recovery](draft-recovery.md).
- Use one versioned API contract for web and Android. Native Android has its own UI and MIDI integration; shared behavior does not imply shared UI code.
- Keep each client's MIDI processing separable from its input transport. Web tests can use the real Web MIDI path through LoopBe1; Android emulator tests will use a local bridge and debug input adapter feeding the same native processing used by device input. The adapter remains outside release builds. See [Local MIDI testing](local-midi-testing.md) for verified results and remaining work.
- The backend uses TypeScript/Fastify, PostgreSQL and self-hosted Better Auth email/password with database-backed sessions. Web uses HttpOnly SameSite cookies through its same-origin proxy; Android uses signed bearer sessions with [secure local persistence](../ADRs/0008-persistent-android-sessions.md). Development HTTP stays separate from the M8 HTTPS release profile. M8 adds restricted account provisioning and operator-assisted recovery; self-service verification/recovery and payment access remain deferred. See the [backend contract](backend-contract.md).
- The first melody scope is one treble voice with chord symbols, rests, accidentals, dotted notes and ties, confirmed by the user during M2. Web uses VexFlow; Android draws natively with Compose Canvas and a bundled music font. M5 extends the score to version 2: all standard major/minor key signatures and meters of 1–12 beats over 2, 4 or 8. Existing v1 C/4/4 sheets remain readable. See [melody authoring](melody-authoring.md).

## Proposed development and deployment path

The workstation audit, preservation steps and cleanup inventory are recorded in [Development setup and repository cleanup](setup-and-cleanup.md). The [local development guide](../development/local-setup.md) tracks the installed Android tools and implemented MIDI test setup; product features and source replacement follow the milestone sequence.

- Build, debug and test the web client, native Android emulator, backend and database on the development machine. Use a repeatable local container setup for backend services and package releases as versioned container images.
- Complete local feature and release validation, then deploy versioned web/HTTPS gateway, API and PostgreSQL containers to Hostinger VPS in M8. Follow the [server installation and security plan](m8-execution-plan.md).
- Use separate settings, credentials and persistent data for development, testing and the public deployment. Start with a fresh server library; move selected scores deliberately through JSON export/import.
- Both clients use the same public HTTPS domain without a VPN. Keep MIDI connected directly to the tablet or browser device.
- Restrict server administration and keep the API's direct port and database private. Verify account isolation, restricted enrollment, updates, monitoring and independent backup restoration before enabling real accounts.
- Hostinger is selected. Confirm the tier, region, domain, renewal pricing, tax and backup costs before provisioning. Resource measurements and recovery rehearsals determine whether the selected server is adequate.
- Subscriptions, payments, unrestricted public signup and app-store publication are deferred without a scheduled milestone. M8 delivers a signed APK for approved users.

## Open design decisions

1. Gesture behavior is resolved for M4/M5 in the chord and melody authoring contracts. Simultaneous two-hand capture remains later work.
2. M5 uses whole-bar chord and quarter-note melody defaults with touch duration, dot, rest and tie controls. Hands-free duration changes can be explored after the first complete workflow.
3. One treble voice and expanded global keys/meters are agreed. Tuplets, multiple voices and more complex notation remain outside the initial scope.
4. M4 exposes chord-name alternatives; M5 chooses key-aware MIDI spelling and allows direct pitch correction. Further shortcuts can follow usability testing.
5. MusicXML plus ChordViewer JSON, explicit preview/new-sheet import and manual chord/note/rest editing are agreed for M5.
6. Subscription model, payments, unrestricted public enrollment and app-store distribution are deferred. M8 uses operator-provisioned accounts and a signed APK distributed over HTTPS. Sharing is deferred; decide its exact scope later.
7. Resolved for M7: device-local recovery with explicit Save, original revision checks and Save as new for simultaneous edits; automatic merging/synchronization remains outside scope.
8. Confirm Hostinger capacity, administrator access, the independent backup destination and alert ownership during M8 preflight. Measure deployed resource use and recovery time before completing M8. The Samsung SM-X610 has physical acceptance evidence; direct RP102 compatibility remains a separate hardware check.

## Mockup notes

The [mockup gallery](mockups/README.md) contains all five relevant concepts and explains their status:

- A: balanced practice, selected by the user.
- A2: the same arrangement with melody notation and chord symbols.
- A3: earlier creation exploration showing an insertion target and live chord preview. Its explicit Insert button is superseded by the user's decision to insert automatically, with easy undo/delete/change.
- The final A3 revision removes the exploratory Record control because the selected initial workflow is step entry.
- B: personal Library with New sheet, Import, search/filter controls, and distinct Practice/Edit actions on each sheet.
- C: Practice with separate tutorial playback controls, live MIDI/chord feedback, and score navigation offering Manual or On match.
- Music glyphs in generated images illustrate layout and are not authoritative score data.

Available generation and revision prompts are saved in [Mockup prompts](mockups/prompts.md). They document the design history; later accepted product decisions take precedence over earlier prompt text.

## References checked during planning

- [Docker Compose in production](https://docs.docker.com/compose/how-tos/production/)
- [M8 server plan and current installation/security references](m8-execution-plan.md)
- [Roland RP102 specifications](https://www.roland.com/au/products/rp102/)

Hostinger is the selected provider. This plan does not record a server purchase or completed deployment.
