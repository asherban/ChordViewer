import { WebMidi, type Input } from 'webmidi';

export interface MidiInputDescriptor {
  id: string;
  name: string;
}

export type MidiStatus =
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; inputs: MidiInputDescriptor[] };

/**
 * Requests MIDI access via WebMidi.js. Never throws — all errors are returned as typed values.
 */
export async function initMidi(): Promise<MidiStatus> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    return { kind: 'unsupported' };
  }
  try {
    await WebMidi.enable();
    return { kind: 'ready', inputs: getInputDescriptors() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message };
  }
}

export function getInputDescriptors(): MidiInputDescriptor[] {
  return WebMidi.inputs.map((input) => ({ id: input.id, name: input.name }));
}

export function getInputById(id: string): Input | undefined {
  return WebMidi.inputs.find((i) => i.id === id);
}

/**
 * Attach noteon/noteoff listeners to the given input.
 * Optionally accepts an onSustainChange callback for CC 64 (sustain pedal).
 * Returns a cleanup function that removes the listeners.
 */
export function attachNoteListeners(
  input: Input,
  onNoteOn: (midiNumber: number) => void,
  onNoteOff: (midiNumber: number) => void,
  onSustainChange?: (active: boolean) => void
): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNoteOn = (e: any) => onNoteOn(e.note.number as number);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNoteOff = (e: any) => onNoteOff(e.note.number as number);

  input.addListener('noteon', handleNoteOn);
  input.addListener('noteoff', handleNoteOff);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handleControlChange: ((e: any) => void) | undefined;
  if (onSustainChange) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleControlChange = (e: any) => {
      if (e.controller.number === 64) {
        onSustainChange(e.rawValue >= 64);
      }
    };
    input.addListener('controlchange', handleControlChange);
  }

  return () => {
    input.removeListener('noteon', handleNoteOn);
    input.removeListener('noteoff', handleNoteOff);
    if (handleControlChange) {
      input.removeListener('controlchange', handleControlChange);
    }
  };
}

/**
 * Register callbacks for MIDI device connect/disconnect.
 * Returns a cleanup function.
 */
export function onMidiConnectionChange(callback: () => void): () => void {
  WebMidi.addListener('connected', callback);
  WebMidi.addListener('disconnected', callback);
  return () => {
    WebMidi.removeListener('connected', callback);
    WebMidi.removeListener('disconnected', callback);
  };
}
