import { useEffect, useRef } from 'react';
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  VoiceMode,
  Formatter,
  StaveConnector,
  Accidental,
} from 'vexflow';
import { midiToVexKey } from '../lib/chordDetect';

interface Props {
  activeNotes: Set<number>;
}

// MIDI 60 = C4. Notes >= 60 go on treble, < 60 go on bass.
const TREBLE_SPLIT = 60;

// For a whole-note chord, the duration is 'w' (whole note) in VexFlow
const WHOLE = 'w';

/**
 * Parse accidental from a VexFlow key string like "db/4" → "b", "f#/3" → "#", "c/4" → null
 */
function accidentalFromKey(key: string): string | null {
  const note = key.split('/')[0]; // e.g. "db", "f#", "c"
  if (note.endsWith('b')) return 'b';
  if (note.endsWith('#')) return '#';
  return null;
}

/**
 * Build a single StaveNote for one or more MIDI note numbers, or a whole rest if no notes.
 */
function buildNote(midiNumbers: number[], clef: string): StaveNote {
  if (midiNumbers.length === 0) {
    // Whole rest — standard position for each clef
    const restKey = clef === 'treble' ? 'b/4' : 'd/3';
    return new StaveNote({ clef, keys: [restKey], duration: `${WHOLE}r` });
  }

  // Sort notes ascending for proper voicing
  const sorted = [...midiNumbers].sort((a, b) => a - b);
  const keys = sorted.map(midiToVexKey);

  const note = new StaveNote({ clef, keys, duration: WHOLE, autoStem: true });

  // Add accidentals for each key that needs one
  keys.forEach((key, idx) => {
    const acc = accidentalFromKey(key);
    if (acc) note.addModifier(new Accidental(acc), idx);
  });

  return note;
}

export function StaffDisplay({ activeNotes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous render
    container.innerHTML = '';

    const width = Math.min(container.clientWidth || 500, 700);
    const height = 260;
    const staveWidth = width - 60;
    const leftMargin = 20;
    const trebleY = 20;
    const bassY = 130;

    // Create SVG renderer
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#f0f0f5');
    ctx.setStrokeStyle('#f0f0f5');

    // Build staves
    const trebleStave = new Stave(leftMargin, trebleY, staveWidth);
    trebleStave.addClef('treble');
    trebleStave.setContext(ctx).draw();

    const bassStave = new Stave(leftMargin, bassY, staveWidth);
    bassStave.addClef('bass');
    bassStave.setContext(ctx).draw();

    // Brace connecting the two staves
    const brace = new StaveConnector(trebleStave, bassStave).setType('brace');
    brace.setContext(ctx).draw();

    // Left bar line connecting both staves
    const lineLeft = new StaveConnector(trebleStave, bassStave).setType('singleLeft');
    lineLeft.setContext(ctx).draw();

    // Split active notes between treble and bass
    const trebleNotes = [...activeNotes].filter((n) => n >= TREBLE_SPLIT);
    const bassNotes = [...activeNotes].filter((n) => n < TREBLE_SPLIT);

    const trebleNote = buildNote(trebleNotes, 'treble');
    const bassNote = buildNote(bassNotes, 'bass');

    // Create voices — SOFT mode so we don't need to fill a full measure
    const trebleVoice = new Voice({ numBeats: 4, beatValue: 4 });
    trebleVoice.setMode(VoiceMode.SOFT);
    trebleVoice.addTickable(trebleNote);

    const bassVoice = new Voice({ numBeats: 4, beatValue: 4 });
    bassVoice.setMode(VoiceMode.SOFT);
    bassVoice.addTickable(bassNote);

    // Format voices across both staves
    const formatter = new Formatter();
    formatter.joinVoices([trebleVoice]).joinVoices([bassVoice]);
    formatter.format([trebleVoice, bassVoice], staveWidth - trebleStave.getNoteStartX() + leftMargin - 20);

    // Draw voices
    trebleVoice.draw(ctx, trebleStave);
    bassVoice.draw(ctx, bassStave);
  }, [activeNotes]);

  return (
    <div className="staff-display">
      <div ref={containerRef} className="staff-display__canvas" />
    </div>
  );
}
