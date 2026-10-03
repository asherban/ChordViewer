/** Score v3 harmony semantics. Manual construction is independent of MIDI recognition. */
export interface ChordSpelling { step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'; alter: -2 | -1 | 0 | 1 | 2 }
export interface ChordDegree { degree: number; alter: -2 | -1 | 0 | 1 | 2 }
export interface ChordDefinition {
  kind: 'tonal' | 'custom' | 'none' | 'polychord';
  root?: ChordSpelling;
  family?: 'major' | 'minor' | 'diminished' | 'augmented' | 'power' | 'sus2' | 'sus4';
  seventh?: 'dominant' | 'major' | 'diminished';
  extension?: '6' | '6/9' | '9' | '11' | '13';
  additions?: ChordDegree[];
  alterations?: ChordDegree[];
  omissions?: number[];
  tones?: number[];
  components?: ChordDefinition[];
  bass?: ChordSpelling;
}
const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const scale = [0, 2, 4, 5, 7, 9, 11];
export const chordMod = (n: number) => (n % 12 + 12) % 12;
export const chordPitchClass = (n: ChordSpelling) => chordMod(natural[n.step] + n.alter);
export const chordNoteLabel = (n: ChordSpelling) => n.step + (n.alter < 0 ? 'b'.repeat(-n.alter) : '#'.repeat(n.alter));
const sortedDegrees = (d: ChordDegree[] = []) => [...d].sort((a, b) => a.degree - b.degree || a.alter - b.alter);
const degreeLabel = (d: ChordDegree) => (d.alter < 0 ? 'b'.repeat(-d.alter) : '#'.repeat(d.alter)) + d.degree;
/** Object-key order and ordering of tone/degree sets are not musical edits. Stack order is. */
export function chordDefinitionKey(d?: ChordDefinition): string | undefined {
  if (!d) return undefined;
  return JSON.stringify([d.kind, d.root?.step, d.root?.alter, d.family, d.seventh, d.extension,
    sortedDegrees(d.additions).map(x => [x.degree, x.alter]), sortedDegrees(d.alterations).map(x => [x.degree, x.alter]),
    [...(d.omissions ?? [])].sort((a,b) => a-b), [...(d.tones ?? [])].sort((a,b) => a-b),
    d.components?.map(chordDefinitionKey), d.bass?.step, d.bass?.alter]);
}

/** Reject unused/contradictory structure instead of silently dropping author intent. */
export function validateChordDefinition(d: ChordDefinition, depth = 0): void {
  const spell = (n: ChordSpelling | undefined) => { if (!n || !Object.hasOwn(natural,n.step) || !Number.isInteger(n.alter) || Math.abs(n.alter) > 2) throw new Error('Invalid chord spelling.'); };
  if (depth > 3) throw new Error('Stacked chords are too deeply nested.');
  if (d.bass) spell(d.bass);
  if (d.kind === 'none') {
    if (Object.keys(d).some(k => k !== 'kind')) throw new Error('N.C. has no chord tones or bass.');
    return;
  }
  if (d.kind === 'polychord') {
    if (!d.components || d.components.length < 2 || d.components.length > 4 || Object.keys(d).some(k => !['kind', 'components', 'bass'].includes(k))) throw new Error('Choose two to four stacked chords.');
    d.components.forEach(c => { if (c.kind === 'none' || c.kind === 'polychord') throw new Error('A stack component must sound.'); validateChordDefinition(c, depth + 1); });
    return;
  }
  spell(d.root);
  if (d.kind === 'custom') {
    if (!d.tones?.length || d.tones.length > 12 || new Set(d.tones).size !== d.tones.length || d.tones.some(n => !Number.isInteger(n) || n < 0 || n > 11) || Object.keys(d).some(k => !['kind', 'root', 'tones', 'bass'].includes(k))) throw new Error('Choose a nonempty set of distinct intervals.');
    return;
  }
  if (d.kind !== 'tonal' || !['major', 'minor', 'diminished', 'augmented', 'power', 'sus2', 'sus4'].includes(d.family ?? '') || d.tones || d.components) throw new Error('Invalid chord family.');
  if (d.seventh && !['dominant', 'major', 'diminished'].includes(d.seventh)) throw new Error('Invalid seventh.');
  if (d.seventh === 'diminished' && d.family !== 'diminished') throw new Error('A diminished seventh preset needs the diminished family; use an altered seventh degree for other families.');
  if (d.extension && !['6', '6/9', '9', '11', '13'].includes(d.extension)) throw new Error('Invalid extension.');
  if (['9', '11', '13'].includes(d.extension ?? '') && !d.seventh) throw new Error('An extended chord needs an explicit seventh; use Add tone for added extensions.');
  if (['6', '6/9'].includes(d.extension ?? '') && d.seventh) throw new Error('Sixth and seventh are independent constructions; use Add tone to combine them.');
  for (const values of [d.additions ?? [], d.alterations ?? []]) {
    if (values.length > 13 || new Set(values.map(degreeLabel)).size !== values.length || values.some(x => !Number.isInteger(x.degree) || x.degree < 1 || x.degree > 13 || !Number.isInteger(x.alter) || Math.abs(x.alter) > 2)) throw new Error('Invalid chord degrees.');
  }
  if (d.omissions && (new Set(d.omissions).size !== d.omissions.length || d.omissions.some(n => !Number.isInteger(n) || n < 1 || n > 13))) throw new Error('Invalid omitted degree.');
  if (!chordPitchClasses(d, false).length) throw new Error('A sounding chord needs at least one tone.');
}

export function chordSymbol(d: ChordDefinition): string {
  let value: string;
  if (d.kind === 'none') return 'N.C.';
  if (d.kind === 'polychord') value = '[' + d.components!.map(chordSymbol).join(' | ') + ']';
  else if (d.kind === 'custom') value = chordNoteLabel(d.root!) + '{' + [...d.tones!].sort((a, b) => a - b).join(',') + '}';
  else {
    const family = d.family!;
    const ext = d.extension;
    let suffix = ({ major: '', minor: 'm', diminished: 'dim', augmented: 'aug', power: '5', sus2: '', sus4: '' })[family];
    if (family === 'power') { /* Added degrees are rendered explicitly below. */ }
    else if (d.seventh === 'major') suffix += family === 'minor' ? `(maj${ext ?? '7'})` : `maj${ext ?? '7'}`;
    else if (d.seventh === 'diminished') suffix += ext ?? '7';
    else if (d.seventh) {
      if (family === 'diminished') suffix = 'm';
      suffix += ext ?? '7';
      if (family === 'diminished') suffix += 'b5';
    } else if (ext) suffix += ext;
    if (family === 'sus2' || family === 'sus4') suffix += family;
    const power = family !== 'power' ? [] : [...(d.seventh ? [d.seventh === 'major' ? 'add7' : 'addb7'] : []), ...(ext === '6' || ext === '6/9' ? ['add6'] : []), ...(ext && ext !== '6' ? ['add9'] : []), ...(ext === '11' || ext === '13' ? ['add11'] : []), ...(ext === '13' ? ['add13'] : [])];
    const modifiers = [...power, ...sortedDegrees(d.alterations).map(degreeLabel), ...sortedDegrees(d.additions).map(x => 'add' + degreeLabel(x)), ...[...(d.omissions ?? [])].sort((a,b) => a-b).map(n => 'no' + n)];
    value = chordNoteLabel(d.root!) + suffix + (family !== 'power' && modifiers.length === 1 && modifiers[0]!.startsWith('add') ? modifiers[0] : modifiers.length ? '(' + modifiers.join(',') + ')' : '');
  }
  return value + (d.bass ? '/' + chordNoteLabel(d.bass) : '');
}

export function chordPitchClasses(d: ChordDefinition, includeBass = true): number[] {
  let notes: number[];
  if (d.kind === 'none') return [];
  if (d.kind === 'polychord') notes = d.components!.flatMap(c => chordPitchClasses(c));
  else if (d.kind === 'custom') notes = d.tones!.map(n => chordMod(chordPitchClass(d.root!) + n));
  else {
    const tones = new Map<number, number[]>([[1, [0]]]);
    const family = d.family!;
    if (family !== 'power') tones.set(family === 'sus2' ? 2 : family === 'sus4' ? 4 : 3, [family === 'minor' || family === 'diminished' ? 3 : family === 'sus2' ? 2 : family === 'sus4' ? 5 : 4]);
    tones.set(5, [family === 'diminished' ? 6 : family === 'augmented' ? 8 : 7]);
    if (d.seventh) tones.set(7, [d.seventh === 'major' ? 11 : d.seventh === 'diminished' ? 9 : 10]);
    if (d.extension === '6' || d.extension === '6/9') tones.set(6, [9]);
    if (d.extension && d.extension !== '6') tones.set(9, [2]);
    if (d.extension === '11' || d.extension === '13') tones.set(11, [5]);
    if (d.extension === '13') tones.set(13, [9]);
    const altered = new Set<number>();
    for (const a of sortedDegrees(d.alterations)) {
      if (!altered.has(a.degree)) tones.set(a.degree, []);
      tones.get(a.degree)!.push(chordMod(scale[(a.degree - 1) % 7]! + a.alter)); altered.add(a.degree);
    }
    for (const a of d.additions ?? []) tones.set(a.degree, [...(tones.get(a.degree) ?? []), chordMod(scale[(a.degree - 1) % 7]! + a.alter)]);
    for (const n of d.omissions ?? []) tones.delete(n);
    notes = [...tones.values()].flat().map(n => chordMod(chordPitchClass(d.root!) + n));
  }
  if (includeBass && d.bass) notes.push(chordPitchClass(d.bass));
  return [...new Set(notes)].sort((a,b) => a-b);
}

/** Supported textual spellings, including every MIDI vocabulary and MusicXML import kind.
 * Complete constructions use their structured definition rather than a free-text grammar. */
export function parseChordDefinition(symbol: string): ChordDefinition | null {
  if (symbol === 'N.C.') return { kind: 'none' };
  const text = symbol.replaceAll('♭','b').replaceAll('♯','#');
  const match = /^([A-G])(bb|##|b|#)?(.*)$/.exec(text);
  if (!match || match[0] !== text) return null;
  const spelling = (step: string, accidentals = ''): ChordSpelling => ({ step: step as ChordSpelling['step'], alter: (accidentals.startsWith('b') ? -accidentals.length : accidentals.length) as ChordSpelling['alter'] });
  const d: ChordDefinition = { kind: 'tonal', root: spelling(match[1]!, match[2]), family: 'major' };
  let suffix = match[3]!;
  const bass = /\/([A-G])(bb|##|b|#)?$/.exec(suffix);
  if (bass) { d.bass = spelling(bass[1]!, bass[2]); suffix = suffix.slice(0, -bass[0].length); }
  const types: Record<string, Partial<ChordDefinition>> = {
    '': {}, m: { family: 'minor' }, '5': { family: 'power' }, dim: { family: 'diminished' }, aug: { family: 'augmented' }, '+': { family: 'augmented' },
    sus2: { family: 'sus2' }, sus4: { family: 'sus4' }, '7': { seventh: 'dominant' }, maj7: { seventh: 'major' }, 'Δ7': { seventh: 'major' }, m7: { family: 'minor', seventh: 'dominant' },
    dim7: { family: 'diminished', seventh: 'diminished' }, m7b5: { family: 'diminished', seventh: 'dominant' }, 'm(maj7)': { family: 'minor', seventh: 'major' }, mMaj7: { family: 'minor', seventh: 'major' },
    aug7: { family: 'augmented', seventh: 'dominant' },
    '7sus4': { family: 'sus4', seventh: 'dominant' }, '7sus2': { family: 'sus2', seventh: 'dominant' }, '6': { extension: '6' }, m6: { family: 'minor', extension: '6' }, '6/9': { extension: '6/9' },
    add9: { additions: [{ degree: 9, alter: 0 }] }, 'm(add9)': { family: 'minor', additions: [{ degree: 9, alter: 0 }] }, madd9: { family: 'minor', additions: [{ degree: 9, alter: 0 }] },
    '9': { seventh: 'dominant', extension: '9' }, '11': { seventh: 'dominant', extension: '11' }, '13': { seventh: 'dominant', extension: '13' },
    maj9: { seventh: 'major', extension: '9' }, maj11: { seventh: 'major', extension: '11' }, maj13: { seventh: 'major', extension: '13' },
    m9: { family: 'minor', seventh: 'dominant', extension: '9' }, m11: { family: 'minor', seventh: 'dominant', extension: '11' }, m13: { family: 'minor', seventh: 'dominant', extension: '13' },
    '7b5': { seventh: 'dominant', alterations: [{ degree: 5, alter: -1 }] }, '7(b5)': { seventh: 'dominant', alterations: [{ degree: 5, alter: -1 }] },
    '7#5': { seventh: 'dominant', alterations: [{ degree: 5, alter: 1 }] }, '7(#5)': { seventh: 'dominant', alterations: [{ degree: 5, alter: 1 }] },
    '7(b9)': { seventh: 'dominant', alterations: [{ degree: 9, alter: -1 }] }, '7(#9)': { seventh: 'dominant', alterations: [{ degree: 9, alter: 1 }] },
  };
  if (!Object.hasOwn(types, suffix)) return null;
  return Object.assign(d, types[suffix]);
}

export function transposeChordDefinition(d: ChordDefinition, shift: number, flats: boolean): ChordDefinition {
  const names: ChordSpelling[] = (flats ? ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'] : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']).map(s => ({ step: s[0] as ChordSpelling['step'], alter: (s.endsWith('b') ? -1 : s.endsWith('#') ? 1 : 0) as ChordSpelling['alter'] }));
  const note = (n: ChordSpelling) => names[chordMod(chordPitchClass(n) + shift)]!;
  return { ...d, ...(d.root ? { root: note(d.root) } : {}), ...(d.bass ? { bass: note(d.bass) } : {}), ...(d.components ? { components: d.components.map(c => transposeChordDefinition(c, shift, flats)) } : {}) };
}
