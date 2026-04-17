# ChordViewer

**ChordViewer** is a real-time chord detection tool for musicians. Connect a MIDI keyboard, play some notes, and instantly see the chord name displayed — no music theory knowledge required.

> **Live demo:** https://asherban.github.io/ChordViewer/

---

## What it does

Play notes on your MIDI keyboard and ChordViewer:

- **Names the chord** as you play it — C major, F#m7, Bbdim7, and hundreds more
- **Shows it on a staff** — treble and bass clef notation updates in real time so you can see exactly where the notes sit
- **Supports sustain pedal** — held notes stay visible while you move to the next chord
- **Tracks your chord history** — the last four chords you played appear in a sidebar so you can review your progressions

### Practice along with YouTube

Paste a YouTube link (piano lesson, backing track, tutorial) and the video plays inside the app alongside your chord detection. The chord history panel lets you see what you played while watching — useful for transcribing or checking your accuracy chord by chord.

![ChordViewer with a piano tutorial video and chord history](docs/screenshot.png)

### Two notation styles

Toggle between standard notation and jazz notation with one click:

| Standard | Jazz |
|----------|------|
| Cmaj7 | CΔ7 |
| Dm7b5 | Dø7 |
| Bdim7 | B°7 |

### MIDI device support

ChordViewer detects any connected MIDI keyboard or controller automatically. If you have multiple devices plugged in, a selector lets you pick which one to use. Devices can be swapped without reloading the page.

---

## Getting started

1. Open https://asherban.github.io/ChordViewer/ in Chrome or Edge (Web MIDI is required)
2. Connect a MIDI keyboard via USB
3. Click the MIDI icon in the top bar and select your device
4. Play a chord — the name and notation appear instantly

To practice with a video, click the YouTube icon, paste a video URL, and hit play.

---

## Browser support

Web MIDI API is required. Chrome and Edge on desktop are fully supported. Firefox and Safari do not support Web MIDI without a browser extension.
