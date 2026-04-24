'use client'

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

const TREBLE_SPLIT = 60;
const WHOLE = 'w';

function accidentalFromKey(key: string): string | null {
  const note = key.split('/')[0];
  if (note.endsWith('b')) return 'b';
  if (note.endsWith('#')) return '#';
  return null;
}

function buildNote(midiNumbers: number[], clef: string): StaveNote {
  if (midiNumbers.length === 0) {
    const restKey = clef === 'treble' ? 'b/4' : 'd/3';
    return new StaveNote({ clef, keys: [restKey], duration: `${WHOLE}r` });
  }

  const sorted = [...midiNumbers].sort((a, b) => a - b);
  const keys = sorted.map(midiToVexKey);

  const note = new StaveNote({ clef, keys, duration: WHOLE, autoStem: true });

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

    container.innerHTML = '';

    const width = Math.min(container.clientWidth || 500, 700);
    const height = 260;
    const staveWidth = width - 60;
    const leftMargin = 20;
    const trebleY = 20;
    const bassY = 130;

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#f0f0f5');
    ctx.setStrokeStyle('#f0f0f5');

    const trebleStave = new Stave(leftMargin, trebleY, staveWidth);
    trebleStave.addClef('treble');
    trebleStave.setContext(ctx).draw();

    const bassStave = new Stave(leftMargin, bassY, staveWidth);
    bassStave.addClef('bass');
    bassStave.setContext(ctx).draw();

    const brace = new StaveConnector(trebleStave, bassStave).setType('brace');
    brace.setContext(ctx).draw();

    const lineLeft = new StaveConnector(trebleStave, bassStave).setType('singleLeft');
    lineLeft.setContext(ctx).draw();

    const trebleNotes = [...activeNotes].filter((n) => n >= TREBLE_SPLIT);
    const bassNotes = [...activeNotes].filter((n) => n < TREBLE_SPLIT);

    const trebleNote = buildNote(trebleNotes, 'treble');
    const bassNote = buildNote(bassNotes, 'bass');

    const trebleVoice = new Voice({ numBeats: 4, beatValue: 4 });
    trebleVoice.setMode(VoiceMode.SOFT);
    trebleVoice.addTickable(trebleNote);

    const bassVoice = new Voice({ numBeats: 4, beatValue: 4 });
    bassVoice.setMode(VoiceMode.SOFT);
    bassVoice.addTickable(bassNote);

    const formatter = new Formatter();
    formatter.joinVoices([trebleVoice]).joinVoices([bassVoice]);
    formatter.format([trebleVoice, bassVoice], staveWidth - trebleStave.getNoteStartX() + leftMargin - 20);

    trebleVoice.draw(ctx, trebleStave);
    bassVoice.draw(ctx, bassStave);
  }, [activeNotes]);

  return (
    <div className="staff-display">
      <div ref={containerRef} className="staff-display__canvas" />
    </div>
  );
}
