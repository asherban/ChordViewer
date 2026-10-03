// @vitest-environment jsdom
import casesDocument from '../../../../tests/fixtures/music/import/cases.json';
import { describe, expect, it } from 'vitest';
import { importScore, MAX_IMPORT_BYTES, ScoreImportError } from './score-import';
import aliases from '../../../../contracts/fixtures/chord-symbol-aliases.json';
import { chordPitchClasses, parseChordDefinition, parseScore, transposePracticeScore } from '@chordviewer/contracts';

const cases = casesDocument.cases as {
  name: string; source: string; fileName: string; valid: boolean; expected?: unknown;
}[];
describe('safe score import shared across browser and native', () => {
  it('imports every supported MusicXML harmony kind as faithful legal notation', () => {
    for(const f of aliases.musicXmlKinds) {
      const xml=`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><root><root-step>C</root-step></root><kind>${f.kind}</kind></harmony><note><rest/><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
      const result=importScore(xml,'kinds.musicxml').score; expect(parseScore(result)).toBe(result);
      expect(result.measures[0].chords[0].symbol).toBe(f.symbol); expect(chordPitchClasses(parseChordDefinition(f.symbol)!)).toEqual(f.pitchClasses);
      const shifted=transposePracticeScore(result,2); expect(parseScore(shifted)).toBe(shifted);
    }
  });
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
