# M6 execution plan — Library and Practice

Planned 2026-09-23. The user requested that the primary agent plan M6, delegate implementation and testing to a GPT-6 Sol subagent, then review and iterate with that agent until complete. Work belongs to `codex/m6-library-practice`; no deployment or publication is part of this milestone.

The [product plan](product-plan.md), [Library mockup](mockups/library.png), [Practice mockup](mockups/practice.png) and [shared visual style](ui-style.md) govern this work. Both web and native Android must deliver the same user workflows. M0–M5 behavior and existing user data must remain usable.

## Outcomes and implementation order

| Stage | Outcome | Evidence before acceptance |
| --- | --- | --- |
| 1. Contracts and Library storage | Safe, additive Library metadata and operations, with compatible migration of existing sheets. | API tests for ownership, revision conflicts, persistence, quota and Trash/restore. |
| 2. Shared Practice rules | Deterministic navigation, matching and temporary score transformation implemented in TypeScript and Kotlin. | Shared musical fixtures and product unit tests, including repeated chords, sustain, interruptions and transposition. |
| 3. Library on both clients | Search/filter/sort, informative cards, distinct Edit/Practice, rename/duplicate/favorite/draft/Trash/restore. | Browser and emulator flows with real saved/imported data, empty/error states and retained drafts. |
| 4. Practice and tutorial on both clients | Current-position highlight, manual and On match navigation, live comparison, display controls, independent embedded tutorial. | Real LoopBe acceptance, no score mutation, player lifecycle/error checks and visual inspection. |
| 5. Review and refinement | Primary-agent code/security/UX review followed by Sol fixes and targeted reruns. | No unresolved actionable findings; meaningful checks and limitations recorded accurately. |
| 6. Delivery | Updated developer commands, architecture decisions, screenshots and verification record; coherent local commits. | Milestone marked complete only after both clients pass. Owned test services cleaned up without deleting saved data. |

Sol owns implementation, product tests, implementation documentation and evidence collection. The primary agent owns this plan, independent review, acceptance decisions and final GitButler commits. Sol reports completed stages and reviewable files incrementally so review can overlap later implementation; no other implementation agents are required.

## Library behavior

- Search titles case-insensitively; filter All/Favorites/Drafts plus notation content and tutorial availability. Combine filters predictably and distinguish an empty account, no search results, Trash and load failure.
- Sort by recently opened or title, with deterministic ties and a sensible fallback for never-opened sheets. Opening a sheet records recency independently of its musical edit timestamp.
- Cards show real title, key/meter, notation content, tutorial availability and saved/unsaved state. Use real lightweight notation previews where space permits; never invent notes or fetch arbitrary thumbnail URLs. Keep the mockup's two-column tablet layout, visible Practice/Edit actions and touch targets; narrow web layouts reflow.
- Add rename, duplicate, favorite, explicit work-in-progress Draft designation, move to Trash and restore. Draft is metadata, separate from an unsaved local edit. Duplicate receives a new owner-scoped identity and copies saved content/tutorial; it must not imply copying unsaved edits without an explicit save.
- Trash is recoverable, excluded from normal Library and opening/editing, and does not silently purge. Retained Trash counts toward the existing 100-sheet quota; state this when the quota is reached. No irreversible-delete control is necessary in M6.
- Preserve the current in-memory draft when switching modes or visiting Library. Existing discard confirmation remains necessary before replacing a dirty workspace, renaming its saved counterpart or trashing it. Failed operations must not clear the draft or mislabel stale data as saved.
- Resume edit and practice positions separately for a sheet within an account. Bound and validate remembered positions against the current score after edits/reloads. Session/device-local position storage is sufficient for M6 if account-scoped and documented; durable draft recovery and cross-device bookmark merging belong to M7.
- Keep import/new-sheet entry points and a useful sheet picker when Create/Practice has no selected sheet.

Backend changes must be additive migrations, explicit DTO/OpenAPI changes and owner-scoped queries. Metadata updates must not clobber score JSON or silently overwrite another musical revision. Use guarded operations for rename, duplicate and Trash transitions. Creation/import/duplication share the same atomic per-owner quota. Foreign and unknown identities have indistinguishable failures. Do not turn a trashed sheet back into an active sheet through a stale save.

## Practice rules

- Practice reads the current draft without editing or automatically saving it. Enter with Manual advance selected; MIDI insertion/replacement stays disarmed. No score, title, tutorial, musical revision or undo history changes in response to Practice input, navigation, transposition or display settings.
- Show a real current bar/chord and highlight it on the existing score renderer. Support tapping a bar/chord, large Previous/Next bar controls, and accessible selection of multiple chord events within a bar. Scroll the selected position into view without forcing the whole page to jump.
- Manual navigation works without MIDI, including empty bars, melody-only scores and a score with no chords. Clamp start/end; no automatic wrap. At the last matched event, show completion and wait for an explicit restart or navigation.
- On match follows individual chord events. Reuse ordered physical-key gesture capture: one fresh gesture, completed after all physical keys release, can advance at most once. Sustain does not delay completion, and held/repeated chart chords cannot skip events. Reset partial gestures when the target, mode, input or score changes, on background/disconnect and while dialogs block interaction. Arming while keys are held waits for their release.
- Match normalized chord identity/pitch classes using the existing vocabulary and allowed optional tones. Ignore octave duplication and enharmonic spelling. An ordinary chord accepts inversions; an explicit slash chord requires its written bass pitch class. Do not treat extra notes or a wrong quality as a match. Unsupported free-text symbols, including unrecognized manual annotations, remain readable with an explicit manual-advance explanation rather than a guessed match.
- Show live played notes/chord, the current chart chord and a clear match indication. Keep last-completed-gesture feedback distinct from the newly selected next target. Automatic melody assessment and performance grading are excluded.
- Include chords-only/melody display, bounded score size controls and hide/show tutorial to expand the score. Keyboard navigation must not steal keys from text fields, dialogs or the player.
- Provide temporary semitone transposition for Practice. Transform a derived view of key, supported chord roots/slash basses and spelled melody; compare incoming MIDI against that displayed target. Preserve timing/ties and the original score/export. Reject an unsupported chord symbol or a shift outside the supported notation range with a clear message; do not partially transpose a sheet. Returning to Edit uses the authored pitches and the selected musical position, with MIDI entry paused.

## Independent tutorial playback

Use the canonical validated YouTube video ID to build an HTTPS player URL. Load on explicit user action, with the player's own playback/speed controls. Video time never advances the score, and MIDI/navigation never seeks the video. Keep playback usable in Create and Practice, with an external YouTube fallback for unavailable, blocked or embedding-disabled videos. Stop/pause playback when leaving the workspace, hiding the video, changing account/sheet or backgrounding.

Android's score, Library and Practice UI remain Kotlin/Compose. An OS WebView may be confined to the official embedded video player; it is not an app wrapper. Do not expose credentials, score data, file access or a native JavaScript bridge to video content. Disable file/content access, mixed content and unsolicited window/navigation behavior. Validate external URLs before opening them. Do not suppress SSL errors or change global WebView/browser security settings.

Current official references checked during planning:

- [YouTube client identity and embedding requirements](https://developers.google.com/youtube/terms/required-minimum-functionality): preserve the web origin referrer; for Android use its installed application ID as the documented HTTPS base/referrer. Keep the player at least 200 by 200 pixels and do not cover its controls.
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference): documented player lifecycle, playback rates and error callbacks. Report unavailable/denied playback honestly; do not fabricate player success.
- Android's official guidance on [URI validation](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading), [native JavaScript bridges](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges) and [file access](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion) supports exact scheme/host checks and a player with no native bridge or local file/content access.

Context7 resolved the official YouTube documentation and returned relevant embedding/rate APIs. Its advertised `--research` option was unsupported by CLI 0.5.12, so the primary agent verified the remaining identity requirements directly on Google's site. The Android reference lookup returned no matching security excerpt; the linked official Android security guides were read directly. Use Context7 for new library-specific implementation questions; follow repository instructions on sandboxing and quota errors.

## Verification and review gates

1. Add meaningful product tests for navigation/matching/transposition, Library operations and account isolation. Share fixtures across TypeScript/Kotlin. Include enharmonic/slash chords, repeated target chords, multiple events per bar, gaps, empty/melody-only scores, sustained releases, interrupted gestures and no authored-score mutation.
2. Extend API integration coverage for additive migration on existing data, metadata persistence, fresh duplicates, conflict/owner boundaries, quota races and Trash/restore. Use the isolated test backend on port 3001; do not destroy development data.
3. Browser acceptance must exercise Library organization, Practice navigation/settings, mode/draft preservation and real Windows LoopBe On match. Check narrow and tablet-width layouts, keyboard/focus behavior and account changes.
4. Native acceptance must exercise the same Library/Practice workflows through the actual emulator UI, with real LoopBe events via the existing debug adapter. Review settled screenshots of both modes. Test YouTube configuration/lifecycle deterministically and attempt actual playback separately; distinguish network/provider restrictions from application failures.
5. Run appropriate regression checks: npm lint/unit/build, relevant browser/API suites, native JVM tests, lint and debug/test/release builds. Serialize heavy builds, browser suites and emulator runs on this 16 GB workstation; do not stop unrelated processes. Follow the memory-limited command in README when necessary.
6. Respect AGENTS.md: do not add or run dedicated tests for developer launchers, setup/process helpers or the debug relay. Product tests may use those tools to deliver MIDI. Preserve launcher compatibility and update README for any required developer commands.
7. Primary review covers the actual diff, async/session lifetimes, stale writes, Trash/duplicate isolation, player/network boundaries, practice purity and musical parity, plus screenshots against the accepted mocks. Sol fixes actionable findings and reruns affected checks. Record exact passes, failures, skips and limits in `docs/development/m6-verification.md`.

M6 does not include sharing, payments, public/NAS hosting, hardware USB/Bluetooth compatibility, advanced notation or durable offline conflict recovery. If a material blocker cannot reasonably be resolved, stop the dependent work and bring the concrete issue and options to the user.
