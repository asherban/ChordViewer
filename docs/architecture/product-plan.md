# ChordViewer product plan

Updated: 2026-09-20. Living discussion draft; accepted decisions and proposals are distinguished below.

See the [architecture index](README.md), [milestone roadmap](milestones.md) and [selected mockups](mockups/README.md).

## Accepted direction

- Build a small commercial product that sells practice and lead-sheet creation tools.
- Three parts: backend, web client, and a natively implemented Android tablet client.
- Both clients must support creating lead sheets directly from a connected digital piano, as well as practicing with them. Tablet authoring is a core workflow.
- MIDI is the primary authoring input. Score import and direct notation editing are also desired input methods; their exact first-release scope is still to be agreed.
- Step entry is the preferred initial interaction: play a chord or note, place it at the selected score position, then advance.
- Automatically insert played chords or notes, with easy undo, deletion and correction. Key release is the proposed commit boundary; detailed sustain and overlapping-note behavior still needs specification.
- Enter chords and melody in separate passes initially. Support for simultaneous melody/accompaniment capture remains a longer-term goal.
- A YouTube tutorial is linked and played independently while creating or practicing. Automatic synchronization and bar timestamps are not required for the initial workflow.
- Use layout A: tutorial and played-chord preview on the left, lead sheet on the right.
- Explore optional melody notation without lyrics. Keep a chord-only view available.
- Library initially contains each user's own sheets and imports; sharing is a later capability.
- Practice supports manual navigation by default and an optional advance-on-matching-chord setting.
- Develop and test on the local machine as much as possible, including the backend and database. Defer NAS deployment until after complete local workflow validation; the NAS remains private. Public users will use a later cloud deployment.
- Target production hosting budget: approximately USD 10 per month.
- Available hardware: Samsung tablet described as "Tab9" (exact model to verify), Roland RP102 piano, Synology DS224+ (installed RAM to verify).
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

## Library: proposed role and behavior

Library is the user's home for finding, organizing and reopening lead sheets.

- Search by title and filter by favorite, draft, notation content and tutorial availability; sort by recently opened or title.
- Each sheet exposes title, key, chord-only/melody status, optional tutorial thumbnail, saved/sync status, and distinct Practice and Edit actions.
- New sheet opens creation with a blank sheet. Import opens a preview so the user can inspect imported notation before saving it as an editable sheet.
- Offer rename, duplicate, favorite and move to a recoverable Trash through each sheet's menu. Avoid an irreversible-delete action on the main card.
- Resume the previous edit position or practice position for the selected sheet.
- Show a useful empty state with New sheet and Import.
- Show only personal sheets and imports for the first release. Sharing comes later; no community/marketplace tab is planned initially.
- Draft describes work in progress, not unsaved data. Autosave and saved/sync status remain separate from that designation.
- A library selection and the current sheet persist when switching between Create and Practice. If no sheet is open, either mode should offer a sheet picker; Create should also offer a blank sheet.

## Practice: proposed role and behavior

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
| Create | Practice | Save current draft state, pause writing from MIDI, open the same sheet for practice |
| Practice | Edit sheet | Open the same sheet at the selected musical position in Create, with entry paused until the edit target is chosen |
| Either sheet mode | Library | Preserve current sheet state and return to the user's collection |

These transitions are proposed interaction details, not yet implemented behavior.

## Proposed implementation principles

### Application responsibilities

| Part | Responsibility |
| --- | --- |
| Backend | Account-scoped sheet storage and synchronization through a versioned API, with paid access support once the commercial model is decided. |
| Web client | Library, Create and Practice; direct browser MIDI input, local chord recognition and editable score presentation. |
| Native Android client | The same core workflows with native UI, MIDI/device integration and local authoring on the tablet. |

Both clients connect directly to the piano and communicate with the backend for stored application data. The backend and NAS do not sit in the live MIDI path. A linked YouTube player has its own playback controls.

### Data and client behavior

- Process MIDI and update the authoring interface locally on each client so note entry does not wait for a backend response.
- Represent chord events and melody events separately on the same musical timeline, with explicit duration, pitch spelling, rests and measure information. The current array of chord strings is insufficient for melody notation.
- Keep live held/sustained MIDI notes separate from saved score events.
- Treat the musical score as editable data, not a picture or PDF. Decide the import/export format after confirming the supported notation scope.
- Use a local draft and explicit synchronization status so a temporary server connection loss does not interrupt creation. M3 preserves metadata drafts during a failed save and rejects stale revisions; durable offline drafts and conflict merging remain to be designed.
- Use one versioned API contract for web and Android. Native Android has its own UI and MIDI integration; shared behavior does not imply shared UI code.
- Keep each client's MIDI processing separable from its input transport. Web tests can use the real Web MIDI path through LoopBe1; Android emulator tests will use a local bridge and debug input adapter feeding the same native processing used by device input. The adapter remains outside release builds. See [Local MIDI testing](local-midi-testing.md) for verified results and remaining work.
- M3 implements TypeScript/Fastify, PostgreSQL and self-hosted Better Auth email/password with database-backed sessions. Web uses HttpOnly SameSite cookies through its same-origin proxy; Android uses signed bearer credentials held only in memory. HTTP is limited to workstation loopback for this milestone. Public HTTPS, account recovery/verification and payment access remain later work. See the [backend contract](backend-contract.md).
- The first melody scope is one treble voice with chord symbols, rests, accidentals, dotted notes and ties, confirmed by the user during M2. Web uses VexFlow; Android draws natively with Compose Canvas and a bundled music font. The foundation proof intentionally supports C key signature and 4/4; additional keys/meters are future contract extensions.

## Proposed development and deployment path

The workstation audit, preservation steps and cleanup inventory are recorded in [Development setup and repository cleanup](setup-and-cleanup.md). The [local development guide](../development/local-setup.md) tracks the installed Android tools and implemented MIDI test setup; product features and source replacement follow the milestone sequence.

- Build, debug and test the web client, native Android emulator, backend and database on the development machine. Use a repeatable local container setup for backend services and package releases as versioned container images.
- Complete local feature and release validation before deploying to the NAS. Then run the web/HTTPS gateway, backend and database with Docker Compose on the NAS as a private deployment rehearsal.
- Use separate settings, credentials and persistent data for development, NAS testing and production.
- Later deploy the same compatible images to a Linux VPS. Move database content explicitly, configure the production domain/HTTPS, and validate restoration before cutover.
- Keep MIDI connected directly to the tablet or browser device; the NAS does not mediate piano input.
- Keep server administration and the database private. Account access controls, updates, off-host database backups and restore checks are part of operating the paid service.
- The cloud provider is not selected. DigitalOcean and OVHcloud are candidates; measure resource use locally and confirm deployment needs during the later NAS milestone before choosing. Verify regional prices, tax, backup coverage and availability at purchase time.

## Open design decisions

1. Automatic insertion gesture details: define physical key release, overlapping notes, rolled chords and sustain behavior so entry captures the intended event once and preserves the selected duration.
2. Rhythm entry: defaults and touch controls for chord/note lengths, rests, dotted values and ties; how the user changes duration with hands at the piano.
3. First-release melody scope: one treble voice with rests, accidentals, dots and ties is agreed. Tuplets, multiple voices and more complex notation remain outside the initial scope; additional keys/meters must be specified before authoring is complete.
4. How to resolve alternate chord names and enharmonic spellings without slowing entry.
5. Import formats and the minimum direct-editing controls needed at launch.
6. Account and subscription model, payment approach and Android distribution channel. Sharing is deferred; decide its exact scope later.
7. Offline draft synchronization and simultaneous edits from two devices.
8. Measure combined local service resource use as backend work is added. M1 selected and verified the tablet emulator configuration in the [local setup guide](../development/local-setup.md). Verify NAS capacity when the later deployment milestone begins. Exact tablet model and physical piano compatibility remain unverified hardware details, but do not block the local test workflow.

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
- [Synology Container Manager supported models](https://www.synology.com/en-in/dsm/packages/ContainerManager)
- [Synology DS224+ specifications](https://www.synology.com/en-ca/products/DS224%2B)
- [Roland RP102 specifications](https://www.roland.com/au/products/rp102/)
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean backup pricing](https://www.digitalocean.com/pricing/backups)
- [OVHcloud VPS pricing](https://www.ovhcloud.com/en/vps/)
- [DigitalOcean public reviews](https://www.trustpilot.com/review/digitalocean.com)
- [OVHcloud public reviews](https://www.trustpilot.com/review/ovhcloud.com)

No provider has been purchased or deployed as part of this planning discussion.
