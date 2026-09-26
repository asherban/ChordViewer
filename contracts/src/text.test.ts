import { describe, expect, it } from 'vitest';
import { isStorageSafeText } from './text.js';

describe('storage-safe Unicode', () => {
  it.each(['C\u0000', '\uD800', '\uDFFF', '\uD800C', 'C\uDFFF'])('rejects unpersistable text %#', value => {
    expect(isStorageSafeText(value)).toBe(false);
  });
  it.each(['Cmaj7', 'שיר', '𝄞 🎵', '\uDBFF\uDFFF', 'line\nbreak'])('preserves valid Unicode text %#', value => {
    expect(isStorageSafeText(value)).toBe(true);
  });
});
