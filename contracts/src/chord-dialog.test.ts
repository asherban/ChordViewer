import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/chord-construction-v3.json' with { type: 'json' };
import textFixture from '../fixtures/chord-symbol-aliases.json' with { type: 'json' };
import vocabulary from '../fixtures/chord-vocabulary-v1.json' with { type: 'json' };
import { appendChord, changeChordAndShift, chordGroup, chordDurationChoices, chordDurationLabel, deleteChordAndShift, logicalChords, nextChordPosition } from './chord-timeline.js';
import { chordDefinitionKey, chordPitchClasses, chordSymbol, parseChordDefinition, validateChordDefinition, type ChordDefinition } from './chord-definition.js';
import { matchesPracticeChord, practiceEvents, supportsPracticeMatch, transposePracticeScore } from './practice.js';
import { parseScore } from './validation.js';
import { insertBar, trimTrailingSilentBars, writeChord } from './fast-entry.js';
import { changeScoreSettings } from './music.js';
import type { LeadSheet } from './score.js';
const blank = (): LeadSheet => ({ schemaVersion: 2, id: 'sheet', title: 'Harmony', keySignature: 'C', timeSignature: { numerator: 4, denominator: 4 }, ticksPerQuarter: 480, measures: [{ id: 'bar', chords: [], melody: [] }] });
const ids = () => { let i = 0; return () => `new-${++i}`; };
describe('shared v3 harmony fixtures', () => {
  it('resolves every emitted MIDI spelling and preserves its pitch classes', () => {
    for (const [root,name] of vocabulary.flatNames.entries()) for (const entry of vocabulary.entries) for (const bass of ['', '/B']) {
      const symbol = name + entry.suffix + bass, d = parseChordDefinition(symbol)!;
      expect(d,symbol).not.toBeNull(); validateChordDefinition(d);
      expect(chordPitchClasses(d)).toEqual([...new Set([...entry.intervals.map(n => (n+root)%12),...(bass ? [11] : [])])].sort((a,b)=>a-b));
      expect(chordDefinitionKey(parseChordDefinition(chordSymbol(d))!)).toBe(chordDefinitionKey(d));
      const score=blank(); score.measures[0]!.chords=[{id:'text',symbol,offsetTicks:0,durationTicks:480}]; expect(parseScore(score)).toBe(score);
    }
  });
  it('preserves legal aliases through timing edits, transposition and practice', () => {
    for (const f of [...textFixture.aliases,...textFixture.musicXmlKinds]) {
      const d=parseChordDefinition(f.symbol)!; expect(d,f.symbol).not.toBeNull(); expect(chordPitchClasses(d)).toEqual(f.pitchClasses);
      const canonical=chordSymbol(d); expect(chordDefinitionKey(parseChordDefinition(canonical)!)).toBe(chordDefinitionKey(d));
      const score=blank(); score.measures[0]!.chords=[{id:'text',symbol:f.symbol,offsetTicks:0,durationTicks:77}]; parseScore(score);
      expect(changeChordAndShift(score,'text',f.symbol,121,ids()).score.measures[0]!.chords[0]!.symbol).toBe(f.symbol);
      const shifted=transposePracticeScore(score,2), e=shifted.measures[0]!.chords[0]!; expect(parseScore(shifted)).toBe(shifted);
      expect(chordPitchClasses(parseChordDefinition(e.symbol)!)).toEqual(f.pitchClasses.map(n=>(n+2)%12).sort((a,b)=>a-b));
      expect([e.id,e.offsetTicks,e.durationTicks]).toEqual(['text',0,77]); expect(supportsPracticeMatch(e.symbol)).toBe(true);
      expect(matchesPracticeChord(e.symbol,f.pitchClasses.map(n=>60+(n+2)%12))).toBe(true);
      if ('canonical' in f) expect(canonical).toBe(f.canonical);
    }
  });
  it('rejects unsupported or malformed text at every version boundary without substituting a chord', () => {
    for (const symbol of textFixture.invalidSymbols) {
      expect(parseChordDefinition(symbol),JSON.stringify(symbol)).toBeNull(); expect(supportsPracticeMatch(symbol)).toBe(false);
      for (const schemaVersion of [1,2,3] as const) {
        const score={...blank(),schemaVersion}; score.measures[0]!.chords=[{id:'bad',symbol,offsetTicks:0,durationTicks:480}]; expect(()=>parseScore(score)).toThrow();
      }
      expect(()=>appendChord(blank(),symbol,480,ids())).toThrow();
    }
  });
  for (const f of fixture.cases) it(f.name, () => {
    const definition = f.definition as ChordDefinition;
    validateChordDefinition(definition); expect(chordSymbol(definition)).toBe(f.symbol); expect(chordPitchClasses(definition)).toEqual(f.pitchClasses);
    const score = appendChord(blank(), f.symbol, 2400, ids(), definition).score;
    expect(parseScore(JSON.parse(JSON.stringify(score)))).toEqual(score);
    expect(chordGroup(score, score.measures[1]!.chords[0]!.id)!.ticks).toBe(2400);
    expect(practiceEvents(score)).toHaveLength(1);
    const shifted = transposePracticeScore(score, 2);
    expect(shifted.schemaVersion).toBe(3); expect(chordPitchClasses(shifted.measures[0]!.chords[0]!.definition!)).toEqual(f.pitchClasses.map(n => (n + 2) % 12).sort((a,b) => a-b));
    if (definition.kind !== 'none') {
      const bass = definition.bass ? chordPitchClasses({ kind: 'custom', root: definition.bass, tones: [0] })[0]! : f.pitchClasses[0]!;
      const notes = [48 + bass, ...f.pitchClasses.map(n => 60 + n)];
      expect(matchesPracticeChord(f.symbol, notes, definition)).toBe(true);
    }
  });
  it('supports every root/bass pitch class and arbitrary 12-tone subsets', () => {
    const spellings = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
    for (let root = 0; root < 12; root++) for (let bass = 0; bass < 12; bass++) {
      const d = parseChordDefinition(`${spellings[root]}/${spellings[bass]}`)!;
      expect(chordPitchClasses(d)).toEqual([...new Set([root,(root+4)%12,(root+7)%12,bass])].sort((a,b) => a-b));
    }
    for (let mask = 1; mask < 4096; mask++) {
      const tones = Array.from({ length: 12 },(_,i) => i).filter(i => mask & 1 << i), d: ChordDefinition = { kind: 'custom', root: { step: 'C', alter: 0 }, tones };
      validateChordDefinition(d); expect(chordPitchClasses(d)).toEqual(tones);
    }
  });
  it('preserves optional fifth matching for ordinary structured and legacy sevenths', () => {
    for (const symbol of ['C7','Cm7','Cmaj7']) {
      const definition = parseChordDefinition(symbol)!;
      const notes = chordPitchClasses(definition).filter(n => n !== 7).map(n => 60+n);
      expect(matchesPracticeChord(symbol,notes,definition)).toBe(matchesPracticeChord(symbol,notes)); expect(matchesPracticeChord(symbol,notes,definition)).toBe(true);
    }
    expect(parseChordDefinition('Cconstructor')).toBeNull(); expect(parseChordDefinition('CtoString')).toBeNull(); expect(parseChordDefinition('Calt')).toBeNull();
    for (const step of ['constructor','toString']) expect(() => validateChordDefinition({ kind:'tonal',root:{step,alter:0} as ChordDefinition['root'],family:'major' })).toThrow();
    expect(() => validateChordDefinition({ kind:'tonal',root:{step:'C',alter:0},family:'major',seventh:'diminished' })).toThrow();
  });
  it('accepts long deterministic labels and key-order/set-order round trips', () => {
    const d: ChordDefinition = { kind:'tonal',root:{step:'C',alter:0},family:'major',seventh:'dominant',alterations:[{degree:11,alter:1},{degree:9,alter:-1}],additions:Array.from({length:13},(_,i)=>({degree:i+1,alter:0})) };
    expect(chordSymbol(d).length).toBeGreaterThan(32);
    const score = appendChord(blank(),chordSymbol(d),2400,ids(),d).score;
    const reordered = JSON.parse(JSON.stringify(score,(_k,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)) as LeadSheet;
    reordered.measures[1]!.chords[0]!.definition!.alterations!.reverse();
    expect(chordDefinitionKey(reordered.measures[1]!.chords[0]!.definition)).toBe(chordDefinitionKey(d)); expect(parseScore(reordered)).toBe(reordered);
    expect(changeScoreSettings(score,'G',score.timeSignature).schemaVersion).toBe(3);
  });
});
describe('logical chord timeline', () => {
  it('covers every one-to-four-beat composition in 4/4', () => {
    const patterns: number[][] = []; const partition = (left:number,parts:number[]) => { if (!left) patterns.push(parts); else for(let n=1;n<=left;n++) partition(left-n,[...parts,n]); }; partition(4,[]);
    expect(patterns).toHaveLength(8);
    for(const pattern of patterns) { let score=blank(); const id=ids(); for(const n of pattern) score=appendChord(score,'C',n*480,id).score;
      expect(score.measures).toHaveLength(1); expect(logicalChords(score).map(c=>c.ticks)).toEqual(pattern.map(n=>n*480)); expect(nextChordPosition(score)).toEqual({measureIndex:1,offsetTicks:0}); }
    const score = {...blank(),timeSignature:{numerator:6,denominator:8 as const}};
    expect(chordDurationChoices(score)).toEqual([240,480,720,960,1200,1440]); expect(chordDurationLabel(score,480)).toBe('2 eighth notes');
  });
  it('shifts later chords across bars, preserves gaps and melody, and edits any fragment', () => {
    const initial=blank(); initial.measures[0]!.melody=[{id:'rest',kind:'rest',offsetTicks:0,duration:{denominator:1,dots:0}}];
    const id=ids(); let score=appendChord(initial,'C',480,id).score; score=appendChord(score,'G',2400,id).score; score=appendChord(score,'G',480,id).score;
    const old=JSON.stringify(score), groups=logicalChords(score), tail=groups[1]!.ids.at(-1)!;
    const changed=changeChordAndShift(score,tail,'Am',3840,id).score;
    expect(logicalChords(changed).map(c=>[c.event.symbol,c.start,c.ticks])).toEqual([['C',0,480],['Am',480,3840],['G',4320,480]]);
    expect(logicalChords(changed)[2]!.event.id).toBe(groups[2]!.event.id); expect(changed.measures[0]!.melody).toBe(score.measures[0]!.melody); expect(JSON.stringify(score)).toBe(old);
    const removed=deleteChordAndShift(changed,logicalChords(changed)[1]!.ids.at(-1)!,id);
    expect(logicalChords(removed).map(c=>c.start)).toEqual([0,480]); expect(removed.measures).toHaveLength(1);
    const gap=blank(); gap.measures[0]!.chords=[{id:'a',symbol:'C',offsetTicks:0,durationTicks:480},{id:'b',symbol:'F',offsetTicks:960,durationTicks:480}];
    expect(logicalChords(changeChordAndShift(gap,'a','C',960,ids()).score)[1]!.start).toBe(1440);
  });
  it('keeps adjacent identical chords separate and exact imported timing/legal aliases', () => {
    const id=ids(); let score=appendChord(blank(),'C+',77,id).score; score=appendChord(score,'Cm(add9)',3000,id).score;
    const changed=changeChordAndShift(score,score.measures[0]!.chords[0]!.id,'C+',121,id).score;
    expect(logicalChords(changed)[0]!.event.symbol).toBe('C+'); expect(logicalChords(changed)[0]!.event.definition).toBeUndefined(); expect(logicalChords(changed)[1]!.start).toBe(121);
    const adjacent=appendChord(appendChord(blank(),'C',480,ids()).score,'C',480,()=> 'separate').score;
    expect(logicalChords(adjacent)).toHaveLength(2);
    expect(chordDurationChoices(changed,3000)).toContain(3000);
  });
  it('protects explicit rest tails through normalization; trims only empty trailing bars', () => {
    const score=blank(); score.measures.push({id:'rest-bar',chords:[],melody:[{id:'tail-rest',kind:'rest',offsetTicks:0,duration:{denominator:1,dots:0}}]},{id:'empty',chords:[],melody:[]});
    expect(trimTrailingSilentBars(score).measures).toHaveLength(2);
    const added=appendChord(score,'C',1920,ids()); const deleted=deleteChordAndShift(added.score,added.eventId,ids()); expect(deleted.measures).toHaveLength(2); expect(deleted.measures[1]!.melody).toEqual(score.measures[1]!.melody);
    expect(trimTrailingSilentBars(blank()).measures).toHaveLength(1);
  });
  it('retains cross-bar identity through bar insertion and web overwrite gestures', () => {
    const id=ids(); const score=appendChord(blank(),'C',3840,id).score;
    const inserted=insertBar(score,1,id); expect(logicalChords(inserted)[0]!.ticks).toBe(5760); expect(practiceEvents(inserted)).toHaveLength(1);
    const split=writeChord(score,{measureIndex:0,offsetTicks:480},'F',480,id).score;
    expect(logicalChords(split).map(c=>[c.event.symbol,c.start,c.ticks])).toEqual([['C',0,480],['F',480,480],['C',960,2880]]); expect(parseScore(split)).toBe(split);
  });
  it('fails limits, duplicate IDs and malformed groups atomically', () => {
    const score=appendChord(blank(),'C',1920,ids()).score, before=JSON.stringify(score);
    expect(()=>changeChordAndShift(score,score.measures[0]!.chords[0]!.id,'C',256*1920+1,ids())).toThrow();
    expect(()=>appendChord(score,'C',480,()=>score.id)).toThrow(); expect(JSON.stringify(score)).toBe(before);
    const broken=appendChord(blank(),'C',2400,ids()).score; broken.measures[1]!.chords[0]!.logicalId='missing'; expect(()=>parseScore(broken)).toThrow();
    const dense=blank(); dense.measures[0]!.chords=Array.from({length:64},(_,i)=>({id:`dense-${i}`,symbol:'C',offsetTicks:i,durationTicks:1})); expect(()=>appendChord(dense,'C',1,ids())).toThrow(); expect(dense.measures[0]!.chords).toHaveLength(64);
  });
});
