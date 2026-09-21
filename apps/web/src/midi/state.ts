export type MidiSnapshot = {
  held: number[];
  sounding: number[];
  sustainChannels: number[];
  messages: number;
};
export const emptySnapshot = (): MidiSnapshot => ({
  held: [],
  sounding: [],
  sustainChannels: [],
  messages: 0,
});

/** Channel identity is retained even when two channels play the same pitch. */
export class MidiState {
  private held = new Set<number>();
  private sounding = new Set<number>();
  private sustain = new Set<number>();
  private messages = 0;

  receive(bytes: readonly number[]): MidiSnapshot {
    const [status, key, value] = bytes;
    if (
      bytes.length !== 3 ||
      !bytes.every(Number.isInteger) ||
      status < 0x80 ||
      status >= 0xf0 ||
      key < 0 ||
      key > 127 ||
      value < 0 ||
      value > 127
    )
      return this.snapshot();
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const id = channel * 128 + key;
    if (kind === 0x90 && value > 0) {
      this.held.add(id);
      this.sounding.add(id);
    } else if (kind === 0x80 || kind === 0x90) {
      this.held.delete(id);
      if (!this.sustain.has(channel)) this.sounding.delete(id);
    } else if (kind === 0xb0 && key === 64) {
      if (value >= 64) this.sustain.add(channel);
      else {
        this.sustain.delete(channel);
        for (const note of this.sounding)
          if (Math.floor(note / 128) === channel && !this.held.has(note))
            this.sounding.delete(note);
      }
    } else if (kind === 0xb0 && [120, 121, 123, 124, 125, 126, 127].includes(key)) {
      if (key === 121) {
        this.sustain.delete(channel);
        for (const note of this.sounding)
          if (Math.floor(note / 128) === channel && !this.held.has(note))
            this.sounding.delete(note);
      } else {
        for (const note of this.held)
          if (Math.floor(note / 128) === channel) this.held.delete(note);
        for (const note of this.sounding)
          if (Math.floor(note / 128) === channel) this.sounding.delete(note);
      }
    } else return this.snapshot();
    this.messages++;
    return this.snapshot();
  }

  reset(): MidiSnapshot {
    this.held.clear();
    this.sounding.clear();
    this.sustain.clear();
    this.messages = 0;
    return this.snapshot();
  }
  snapshot(): MidiSnapshot {
    return {
      held: [...this.held].sort((a, b) => a - b),
      sounding: [...this.sounding].sort((a, b) => a - b),
      sustainChannels: [...this.sustain].sort((a, b) => a - b),
      messages: this.messages,
    };
  }
}

export function noteLabel(id: number): string {
  const pitch = id % 128;
  return `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][pitch % 12]}${Math.floor(pitch / 12) - 1} · ch ${Math.floor(id / 128) + 1}`;
}
