# ChordViewer Architecture

_Last updated: 2026-04-22_

## Overview

ChordViewer is a browser-based MIDI chord assistant. It listens to a connected MIDI keyboard, identifies the chord being played in real time, and supports three usage modes: learning/practicing, transcribing a lead sheet, and playing along with a saved chart. There is no backend — all state is local.

## Tech Stack

- **UI**: React 19 (JSX transform, no class components)
- **Build**: Vite 8 + TypeScript 6, deployed to GitHub Pages via `gh-pages`
- **MIDI**: WebMidi.js v3 (wraps the Web MIDI API; Chromium-only)
- **Chord detection**: `@tonaljs/chord-detect` + `@tonaljs/midi`
- **Notation rendering**: VexFlow 5 (grand staff SVG), custom jazz-symbol renderer in `JazzChord`
- **Testing**: Vitest + jsdom + Testing Library; CI runs `vitest run` on every PR

## Application Structure

```
src/
  main.tsx          — entry point, StrictMode wrapper
  App.tsx           — all global state + mode router
  components/       — UI components, one file per component
  lib/              — pure logic modules (no React deps except useChordHistory)
  index.css / App.css — global styles and CSS custom properties
```

All application state lives in `App.tsx`. There is no state management library.

## Core Concepts

**MIDI note set**: Two separate `Set<number>` values track physical notes (keys currently held) and sustained notes (keys released while the sustain pedal is down). Their union, `activeNotes`, drives chord detection — see `App.tsx:82–90`.

**Chord detection pipeline**: `activeNotes` → MIDI numbers sorted → pitch class strings (octave stripped, flats preferred) → deduplication → `detect()` from TonalJS → optional `detectSeventhNoFifth` fallback → `ChordResult`. Defined in `src/lib/chordDetect.ts`.

**Notation layer**: All internal chord data uses TonalJS native names (e.g. `"Cmaj7"`). The `applyNotation()` function in `src/lib/notation.ts` transforms to jazz glyphs (Δ, ø, °, −) at render time only. The `JazzChord` component handles proportional superscript/subscript layout for extensions and bass notes.

**Lead sheet / chart**: The `LeadSheet` type (`src/lib/leadSheet.ts`) is `{ meta: Meta, bars: (string | null)[][] }` — a simple 2D array of chord name strings, up to 4 chords per bar. Persisted to localStorage.

## Component Architecture

- `TopBar` — app header: mode switcher, notation toggle, MIDI status icon, YouTube panel trigger, fullscreen toggle (`src/components/TopBar.tsx`)
- `LearnView` — real-time chord display + optional YouTube side panel; layout switches between single-column and split at the YouTube breakpoint (`src/components/LearnView.tsx`)
- `TranscribeView` — lead sheet editor with armed-cursor editing model; accepts MIDI input or tap from the recent-chords palette (`src/components/TranscribeView.tsx`)
- `PlayView` — rolling chart display that advances the cursor when a played chord matches the expected one (`src/components/PlayView.tsx`)
- `ChordDisplay` — renders the detected chord name, alternatives, and note pills (`src/components/ChordDisplay.tsx`)
- `StaffDisplay` — VexFlow grand staff (treble + bass), re-rendered on every `activeNotes` change (`src/components/StaffDisplay.tsx`)
- `Bar` — single measure in Transcribe/Play views; renders up to 4 chord slots with armed/playing/past visual states (`src/components/Bar.tsx`)
- `JazzChord` — inline chord symbol with optional jazz-notation glyph rendering and superscript extensions (`src/components/JazzChord.tsx`)
- `ChordPill` — clickable chord badge used in the Transcribe palette and Learn history (`src/components/ChordPill.tsx`)
- `YouTubePanel` — iframe embed + `ChordHistory` side panel, only shown in Learn mode (`src/components/YouTubePanel.tsx`)
- `ChordHistory` — ordered list of last 4 stable chords (`src/components/ChordHistory.tsx`)
- `StatusMessage` — browser compatibility / MIDI error banners (`src/components/StatusMessage.tsx`)

## Library Modules

- `src/lib/midi.ts` — wraps WebMidi.js: `initMidi`, `attachNoteListeners` (note-on/off + sustain CC 64), `getInputDescriptors`
- `src/lib/chordDetect.ts` — `detectChord(Set<number>) → ChordResult`; also exports `midiToVexKey` for VexFlow rendering
- `src/lib/chordMatch.ts` — `matchesExpected(expected, detected)` for Play-mode cursor advancement; normalises accidentals and ignores bass when expected chord has no slash
- `src/lib/notation.ts` — `applyNotation` and `toJazzNotation`; QUALITY_MAP is ordered longest-first to prevent partial matches
- `src/lib/useChordHistory.ts` — React hook: debounces chord changes (600 ms stability, 250 ms gap tolerance) before appending to a capped history array
- `src/lib/leadSheet.ts` — `LeadSheet` type, `loadChart`/`saveChart` (localStorage), `emptyChart`
- `src/lib/youtube.ts` — URL parsing (`parseYouTubeId`, `parseYouTubeStart`), oEmbed title fetch, `buildEmbedUrl`

## Data Flow

```
MIDI device
  → WebMidi.js (webmidi)
  → attachNoteListeners (src/lib/midi.ts)
  → physicalNotes / sustainedNotes state (App.tsx)
  → activeNotes (useMemo union)
  → detectChord (src/lib/chordDetect.ts)  →  ChordResult
  → useChordHistory hook                  →  ChordHistoryEntry[]
  → LearnView / TranscribeView / PlayView
  → ChordDisplay / Bar / StaffDisplay / JazzChord (render)
```

Persistence is a side-effect: `App.tsx` has `useEffect` watchers on `notation`, `mode`, `chart`, and `videoHistory` that write to localStorage.

## Key Design Decisions

- **All state in App.tsx**: No context or external store. The app is small enough that prop-drilling is manageable; avoiding a state library keeps the dependency surface minimal.
- **Pitch class deduplication before detection**: C3 and C4 both become `"C"` before being passed to TonalJS. This prevents duplicate note pills and avoids octave-sensitive false negatives in chord detection (`src/lib/chordDetect.ts:70`).
- **`no5` suffix stripping**: TonalJS returns e.g. `"C7no5"` for an incomplete voicing. These suffixes are stripped immediately after detection so the UI always shows the canonical name (`src/lib/chordDetect.ts:73–75`).
- **Manual `detectSeventhNoFifth` fallback**: TonalJS returns nothing for maj7/m7/mMaj7 without a fifth (root + 3rd + 7th only). A custom interval-matching function handles these common piano voicings (`src/lib/chordDetect.ts:30–47`).
- **Two independent debounce timers**: `useChordHistory` (600 ms) and `TranscribeView`'s commit timer (450 ms) are intentionally separate. Transcribe also adds a "wait for release" guard (`waitingForReleaseRef`) to prevent double-committing the same chord when the held notes change slightly.
- **Jazz notation is display-only**: The `"regular"` / `"jazz"` toggle transforms names at render time; all stored data and internal logic uses TonalJS native names. This avoids having to parse jazz glyphs anywhere.
- **VexFlow SOFT voice mode**: `VoiceMode.SOFT` is required so VexFlow doesn't throw when fewer than 4 beats are filled — the staff always shows only the currently held chord (`src/components/StaffDisplay.tsx:108–109`).
- **Play-mode bass note tolerance**: `matchesExpected` ignores the bass note of a detected slash chord when the chart chord has no slash, since transcribed charts rarely notate bass voice (`src/lib/chordMatch.ts:26–31`).
- **2026-04-22**: Added `.claude/skills/architecture-docs/` skill and `.claude/hooks/arch-docs-stop-hook.sh` to automate doc updates. The hook compares git commit timestamps of `src/` vs `docs/development/` to determine when docs need refreshing.

## Configuration

- `vite.config.ts`: `base: '/'` (no subdirectory); Vitest configured inline with jsdom environment and `globals: true`
- `tsconfig.app.json`: `erasableSyntaxOnly: true` (TypeScript 6 strict mode), `noUnusedLocals/Parameters: true`
- CI (`.github/workflows/ci.yml`): runs only `vitest run` — no lint or type-check step in CI
