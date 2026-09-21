import { describe, expect, it } from 'vitest';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };
import { configuration } from './config.js';
import { createInput, importInput, tutorialUrl, updateInput } from './input.js';

describe('storage request boundary', () => {
  it('normalizes supported tutorials without requesting any remote resource', () => {
    expect(tutorialUrl('https://youtu.be/dQw4w9WgXcQ?t=12')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(tutorialUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=ignored')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(tutorialUrl('')).toBeNull();
  });
  it.each(['http://youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://127.0.0.1/private',
    'https://youtu.be/invalid', 'https://youtu.be/dQw4w9WgXcQ/extra'])('rejects unsafe tutorial %s', url => {
    expect(() => tutorialUrl(url)).toThrow();
  });
  it('rejects owner/revision overposting, blank and overlong titles', () => {
    expect(() => createInput({ title: 'Sheet', template: 'blank', ownerId: 'other' })).toThrow();
    expect(() => createInput({ title: 'Sheet', template: ['example'] })).toThrow();
    expect(() => createInput({ title: ' ', template: 'blank' })).toThrow();
    expect(() => createInput({ title: '𝄞'.repeat(201), template: 'blank' })).toThrow();
    expect(createInput({ title: '𝄞'.repeat(200), template: 'blank' }).title.length).toBe(400);
  });
  it('requires an explicit current revision and immutable score ID', () => {
    const input = { score: example, tutorialUrl: null, expectedRevision: 1 };
    expect(updateInput(input, example.id).expectedRevision).toBe(1);
    expect(() => updateInput(input, 'different')).toThrow();
    expect(() => updateInput({ ...input, expectedRevision: 0 }, example.id)).toThrow();
    expect(() => updateInput({ ...input, expectedRevision: '1' }, example.id)).toThrow();
    expect(() => updateInput({ ...input, score: { ...example, schemaVersion: 99 } }, example.id)).toThrow();
  });
  it('validates blank-sheet keys and meters and preserves the example notation', () => {
    expect(createInput({ title: 'Study', template: 'blank', keySignature: 'F#m', timeSignature: { numerator: 6, denominator: 8 } })).toMatchObject({
      keySignature: 'F#m', timeSignature: { numerator: 6, denominator: 8 },
    });
    expect(createInput({ title: 'Study', template: 'blank' })).toMatchObject({ keySignature: 'C', timeSignature: { numerator: 4, denominator: 4 } });
    for (const extra of [{ keySignature: 'H' }, { keySignature: null }, { timeSignature: null }, { timeSignature: { numerator: 0, denominator: 4 } },
      { timeSignature: { numerator: 4, denominator: 3 } }]) expect(() => createInput({ title: 'Study', template: 'blank', ...extra })).toThrow();
    expect(() => createInput({ title: 'Study', template: 'example', keySignature: 'D' })).toThrow('original');
  });
  it('validates import envelopes without accepting ownership or revision fields', () => {
    expect(importInput({ score: example, title: 'My imported copy' })).toEqual({ score: example, title: 'My imported copy', tutorialUrl: null });
    for (const extra of [{ ownerId: 'other' }, { expectedRevision: 1 }, { id: 'target' }]) expect(() => importInput({ score: example, title: 'Copy', ...extra })).toThrow();
    expect(() => importInput({ score: { ...example, schemaVersion: 99 }, title: 'Copy' })).toThrow();
    expect(() => importInput({ score: example, title: ' ' })).toThrow();
    expect(() => importInput({ score: example, title: 'Copy', tutorialUrl: 'file:///secret' })).toThrow();
  });
});
describe('explicit local deployment', () => {
  const local = { LOCAL_DEVELOPMENT: 'true', DATABASE_URL: 'postgres://example@database/chordviewer',
    BETTER_AUTH_SECRET: 'a'.repeat(64), AUTH_BASE_URL: 'http://127.0.0.1:3000', TRUSTED_ORIGINS: 'http://127.0.0.1:5173' };
  it('accepts loopback deployment and requires generated secrets', () => {
    expect(configuration(local).host).toBe('127.0.0.1');
    expect(() => configuration({ ...local, BETTER_AUTH_SECRET: 'short' })).toThrow();
    expect(() => configuration({ ...local, LOCAL_DEVELOPMENT: 'false' })).toThrow();
  });
  it.each(['http://0.0.0.0:3000', 'https://public.example', 'http://127.0.0.1/path', 'http://user:password@localhost:3000'])('rejects public or ambiguous origin %s', url => {
    expect(() => configuration({ ...local, AUTH_BASE_URL: url })).toThrow();
    expect(() => configuration({ ...local, TRUSTED_ORIGINS: url })).toThrow();
  });
});
