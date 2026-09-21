// @vitest-environment jsdom
import casesDocument from '../../../../tests/fixtures/music/import/cases.json';
import { describe, expect, it } from 'vitest';
import { importScore, MAX_IMPORT_BYTES, ScoreImportError } from './score-import';

const cases = casesDocument.cases as {
  name: string; source: string; fileName: string; valid: boolean; expected?: unknown;
}[];
describe('safe score import shared across browser and native', () => {
  it.each(cases)('$name', test => {
    if (!test.valid) expect(() => importScore(test.source, test.fileName)).toThrow(ScoreImportError);
    else {
      const result = importScore(test.source, test.fileName);
      expect(result.score).toEqual(test.expected);
      expect(result.format).toBe(test.fileName.endsWith('.json') ? 'json' : 'musicxml');
      expect(result.warnings.length).toBe(result.format === 'json' ? 0 : 1);
    }
  });
  it('bounds actual UTF-8 bytes, not just JavaScript string length', () => {
    expect(() => importScore('🎹'.repeat(MAX_IMPORT_BYTES / 4 + 1), 'score.json')).toThrow('1 MiB');
  });
  it('accepts UTF-8 BOM JSON and preserves the source identity only for preview', () => {
    const example = cases.find(test => test.fileName === 'study.json')!;
    expect(importScore('\uFEFF' + example.source, example.fileName).score).toEqual(example.expected);
  });
});
