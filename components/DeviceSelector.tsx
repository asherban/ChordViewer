'use client'

import type { MidiInputDescriptor } from '../lib/midi';

interface Props {
  inputs: MidiInputDescriptor[];
  selectedInputId: string | null;
  onSelect: (id: string) => void;
}

export function DeviceSelector({ inputs, selectedInputId, onSelect }: Props) {
  return (
    <div className="device-selector">
      <label htmlFor="device-select">MIDI Input</label>
      <select
        id="device-select"
        value={selectedInputId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          — Select a device —
        </option>
        {inputs.map((input) => (
          <option key={input.id} value={input.id}>
            {input.name}
          </option>
        ))}
      </select>
    </div>
  );
}
