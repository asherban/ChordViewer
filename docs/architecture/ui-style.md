# Shared application layout

Accepted on 2026-09-21 as an M3 follow-up, before MIDI authoring. Both clients follow the [selected mockups](mockups/README.md). The initial M3 implementation proved storage and notation but did not implement that visual direction; this follow-up brings the existing features into the intended application shell.

## Shared design

| Element | Decision |
| --- | --- |
| Canvas / paper | Warm neutral `#f6f7f3` / `#fffefb`. |
| Text / secondary text | Dark green `#18332f` / muted green `#697a73`. |
| Action / selected state | Green `#176f5b` / sage `#e6eee7`. |
| Borders | Subtle `#dce3d8`, rounded cards and controls. |
| Typography | Serif brand, library titles and score headings; native/system sans-serif for controls. |
| Navigation | Persistent compact header with Library, Create and Practice. |
| Library | Personal sheet cards showing actual title, revision and tutorial metadata, with Edit and Practice actions. Two columns on tablet-width windows. |
| Workspace | Tutorial and live input on the left; the lead sheet occupies the remaining space. Content scrolls inside the window. Narrow layouts place the score above the sidebar. |
| Details | A collapsible drawer on web and a native dialog on Android, keeping routine reading focused on the score. |

The implementations use platform-appropriate controls, so they share layout and visual language rather than identical pixels. Android notation remains native Kotlin/Compose Canvas. Web notation remains VexFlow. The score display supports chords alone or chords plus the agreed treble melody voice.

## Score presentation

The score follows [balanced chord-only Practice](mockups/a-balanced-practice.png) and [Practice with melody](mockups/practice.png). Chord-only bars use large bold serif symbols, small bar numbers and thin vertical dividers, without a horizontal staff-like baseline. A whole-bar chord sits in the middle of its span. Multiple chords retain their order, durations and empty intervals; labels reserve enough space to remain legible.

Melody uses connected staff lines across each system, with prominent serif chord names anchored at their onset. A treble clef and the selected key signature begin each system; the time signature appears at the beginning of the sheet. Four bars fit across a normal tablet score. Dense music and long manual names can reduce a system to two or one bar; an oversized bar scrolls instead of shrinking or clipping its contents. Narrow displays reflow at the same readable note/text size. Ledger notes, accidentals, rests, dots and ties remain part of the notation.

Create and Practice share these score renderers. Create selects chords directly and melody notes/rests on the staff, with an accessible event picker as an alternative. The two entry passes have duration/position controls and shared history. Its insertion highlight represents the real Create cursor. Practice highlights the actual selected bar and chord and never invents a section name, melody or playback progress to imitate a mockup.

## Window and full-screen behavior

The web application fills the available browser viewport automatically. Its header remains visible while library, score or sidebar content scrolls. A user-initiated **Enter full screen** button requests full screen for the entire document, including dialogs. **Exit full screen** leaves it; browser-driven exits update the button through `fullscreenchange`. Unsupported or denied requests provide accessible feedback and retain the window-filling layout. Full screen is optional and never requested automatically.

Android fills the activity while respecting system-bar insets. It retains normal Android system navigation.

## Current interaction boundaries

Library holds each account's saved sheets and imports, with search, content/tutorial filters, favorites, Draft, rename, duplicate and recoverable Trash. Card previews contain at most four real chord labels from the first bar; they do not purport to be miniature notation. Create supports blank/example sheets, separate automatic MIDI chord/melody entry, direct editing, correction/deletion/replacement, undo/redo, key/meter changes and saving music plus title/tutorial. Its timeline has bar/beat targets and duration controls in the existing paper/sage workspace. Import previews show the real parsed score and conversion warnings before creating a new sheet. Practice shows the current draft and live MIDI feedback without editing it. Manual navigation starts by default; optional On match advances only after a fresh completed chord gesture. Size, notation lane and transposition affect the practice view only. Mode changes preserve the draft and MIDI connection while pausing entry. Explicit sign-out clears the account workspace and MIDI input; backgrounding the app/page disconnects input so stale held notes cannot remain active.

The tutorial panel loads the canonical YouTube embed only after a user tap, with native playback controls and a separate external link. The embed disappears when leaving the workspace, hiding the tutorial, changing sheet/account or backgrounding; web also unmounts it while a blocking dialog is open. Neither client places custom controls over the player. The [chord-entry contract](chord-authoring.md), [melody/import contract](melody-authoring.md) and [M6 execution plan](m6-execution-plan.md) define the implemented behavior and acceptance criteria.

Shell screenshots and checks are recorded in [UI verification](../development/m3-ui-verification.md); authoring additions are in [M4 verification](../development/m4-verification.md) and [M5 verification](../development/m5-verification.md). The mockups remain the design reference as future controls become functional.
