# M3 UI alignment verification

This follow-up aligns the web and native Android clients with the selected warm-neutral/sage mockups. It is separate from M4 authoring work. Implementation and evidence are on `codex/m3-ui-alignment`, stacked above M3; no deployment or push is part of this change.

## Delivered behavior

Both clients have persistent Library/Create/Practice navigation, personal sheet cards, compact sheet-detail controls and a score workspace beside tutorial/live MIDI panels. Web fills the browser viewport with internal scrolling and offers a user-initiated full-screen button. Unsupported or denied full-screen requests leave navigation usable. Native uses platform controls and respects system insets. See [shared layout decisions](../architecture/ui-style.md).

Mode changes keep the current sheet and unsaved details. Root-owned MIDI input survives navigation and metadata saves. Sign-out clears input; backgrounding disconnects it. Web permission results and queued frames from an old connection cannot revive that connection, and reconnecting a port waits for its outstanding close. The obsolete hero/diagnostic wrappers, styles and close-sheet helpers have been removed.

## Checks

Verification date: 2026-09-21. The browser uses the separate test API on port 3001. The Android checks use the local tablet emulator; no physical piano or tablet is needed.

| Check | Result |
| --- | --- |
| `npm run check` | Lint, **115 unit/contract tests across 11 files**, and contracts/API/web builds passed. A final unused-helper removal also passed scoped lint and TypeScript checking. |
| `npm run test:web` | **9 browser tests passed**: desktop/tablet/narrow sizing, real full-screen entry/exit and external exit, unavailable full-screen feedback, dialog keyboard cancellation/focus, preserved drafts, account isolation, reopening, revision conflicts and failed-request recovery. |
| Actual browser LoopBe MIDI | Passed in installed Chrome: held C major survives Library → Practice → Create and metadata save; sustain, zero-velocity note-off, channel separation, final clear and unchanged score passed. The final run observes the app's actual MIDI port before sending. |
| Native build | Debug, release and AndroidTest APKs built; **39 JVM tests passed**, lint **0 errors / 12 existing warnings**. |
| Native backend instrumentation | **1 opt-in test passed** on the final app APK against the real test API. |
| Native UI + real held MIDI | **1 opt-in UI test passed**: actual sign-in, saved sheet opening, draft retention across modes, metadata save, melody preference retention, held C4 preserved through navigation/save and sign-out disconnect. A fresh independent HTTP login also read the native-saved title at revision 2. |
| Native real LoopBe relay | **1 opt-in test passed**: notes, sustain, zero-velocity note-off, channel identity, final clear, explicit disconnect and reconnect reset. |

The full-screen acceptance uses the real browser API; external `exitFullscreen()` exercises the same state-change event as browser Escape. It does not assert physical keyboard Escape behavior in every browser. Browser permission denial and late MIDI results also have focused unit coverage. One MIDI rerun missed initial notes during concurrent builds; it was not counted as a pass. The final real-input rerun passed after build completion and explicit port-readiness verification.

The existing VexFlow bundle-size warning remains. Backend persistence/lifecycle/security integration was already accepted in [M3](m3-verification.md); this follow-up does not change the backend, schema, dependencies or deployment settings.

## Review

Independent code and security review covered the web shell/dialogs, native navigation, root MIDI lifetime and native UI test helper. Resolved findings include pending permission results after sign-out, stale MIDI callbacks, repeated asynchronous closes, mobile full-screen feedback covering navigation, MIDI clearing on native sign-out, and native conflict instructions needing an explicit Library → Refresh step. The native fixture helper transports synthetic credentials through stdin into app-private storage, deletes that fixture, redacts test failure output and removes only its own port mappings. Verification also corrected a Windows PowerShell stdin-encoding incompatibility and a native test lookup race against a temporarily empty accessibility tree; failed attempts were not counted as passes. No actionable review findings remain within this follow-up's scope.

## Actual application screenshots

The original mockups remain unchanged. These are screenshots of running applications using synthetic test accounts.

| Web | Screenshot |
| --- | --- |
| Library | [Personal library](../architecture/evidence/ui-web-library.png) |
| Create | [Saved score workspace](../architecture/evidence/ui-web-create.png) |
| Practice | [Read-only score and input](../architecture/evidence/ui-web-practice.png) |
| Narrow window | [360 × 800 layout](../architecture/evidence/ui-web-narrow.png) |
| Actual MIDI | [Held chord after navigation/save](../architecture/evidence/ui-web-midi.png) |

| Native Android | Screenshot |
| --- | --- |
| Library | [Personal library](../architecture/evidence/ui-native-library.png) |
| Create | [Native score workspace](../architecture/evidence/ui-native-create.png) |
| Practice + actual MIDI | [Saved revision and held C4](../architecture/evidence/ui-native-practice.png) |
| Chords only | [Preserved display preference](../architecture/evidence/ui-native-chords.png) |

All nine screenshots were opened and visually inspected. Web evidence includes desktop/tablet and narrow windows; native evidence uses the 1280 × 800 tablet emulator. Android system bars and platform typography intentionally differ from the browser.

## Remaining scope

The layout now follows the mockups' visual direction, but controls appear only when their behavior exists. MIDI insertion/undo/correction, melody editing/import, embedded video and guided practice are M4–M6. Native USB/Bluetooth, physical Samsung/Roland compatibility, offline draft recovery and deployment remain later work. Full-screen availability depends on browser policy; filling the browser window does not.
