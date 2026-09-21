import { SUPPORTED_KEYS, keyLabel, type KeySignature, type LeadSheet } from "@chordviewer/contracts";

export function ScoreSettingsFields({ value, disabled, onChange }: {
  value: Pick<LeadSheet, "keySignature" | "timeSignature">; disabled: boolean;
  onChange: (value: Pick<LeadSheet, "keySignature" | "timeSignature">) => void;
}) {
  return <div className="score-settings-fields">
    <label className="field">Key signature<select aria-label="Key signature" value={value.keySignature} disabled={disabled}
      onChange={event => onChange({ ...value, keySignature: event.target.value as KeySignature })}>
      {SUPPORTED_KEYS.map(key => <option value={key} key={key}>{keyLabel(key)}</option>)}
    </select></label>
    <label className="field">Beats per bar<select aria-label="Beats per bar" value={value.timeSignature.numerator} disabled={disabled}
      onChange={event => onChange({ ...value, timeSignature: { ...value.timeSignature, numerator: Number(event.target.value) } })}>
      {Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option key={value}>{value}</option>)}
    </select></label>
    <label className="field">Beat unit<select aria-label="Beat unit" value={value.timeSignature.denominator} disabled={disabled}
      onChange={event => onChange({ ...value, timeSignature: { ...value.timeSignature, denominator: Number(event.target.value) as 2 | 4 | 8 } })}>
      <option value={2}>Half note (2)</option><option value={4}>Quarter note (4)</option><option value={8}>Eighth note (8)</option>
    </select></label>
  </div>;
}
