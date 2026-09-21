import { durationTicks, KEY_SIGNATURES, measureTicks, parseScore, type ChordEvent, type KeySignature, type LeadSheet, type MelodyEvent, type NoteDuration, type Pitch, type TimeSignature } from '@chordviewer/contracts';

export const MAX_IMPORT_BYTES = 1_048_576;
export interface ImportedScore { score: LeadSheet; warnings: string[]; format: 'json' | 'musicxml' }
export class ScoreImportError extends Error {}
function fail(message: string): never { throw new ScoreImportError(message); }
const children = (node: Element): Element[] => Array.from(node.children);
function allowed(node: Element, names: string[]): void {
  if (children(node).some(child => !names.includes(child.localName))) fail(`Unsupported MusicXML content in ${node.localName}.`);
}
function one(node: Element, name: string, required = false): Element | undefined {
  const found = children(node).filter(child => child.localName === name);
  if (found.length > 1 || (required && found.length !== 1)) fail(`MusicXML requires one ${name} in ${node.localName}.`);
  return found[0];
}
function text(node: Element, name: string, fallback?: string): string {
  const child = one(node, name, fallback === undefined);
  if (child && children(child).length) fail(`Invalid MusicXML ${name}.`);
  return child?.textContent?.trim() ?? fallback ?? '';
}
function integer(value: string, minimum: number, maximum: number): number {
  if (!/^[+-]?\d+$/.test(value)) fail('MusicXML contains a non-integer musical value.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) fail('MusicXML contains an unsupported musical value.');
  return number;
}

// Bound nesting before invoking a platform XML parser, including ignored metadata.
function checkXmlBounds(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('DTD and entity declarations are not allowed. Export MusicXML without a DTD.');
  let position = 0; let depth = 0; let nodes = 0;
  while ((position = xml.indexOf('<', position)) !== -1) {
    let ending: string | undefined;
    if (xml.startsWith('<!--', position)) ending = '-->';
    else if (xml.startsWith('<![CDATA[', position)) ending = ']]>';
    else if (xml.startsWith('<?', position)) {
      if (!/^<\?xml\s/.test(xml.slice(position, position + 7))) fail('XML processing instructions are not supported.');
      ending = '?>';
    }
    if (++nodes > 20_000) fail('MusicXML has too many XML nodes.');
    if (ending) {
      const end = xml.indexOf(ending, position + 2);
      if (end < 0) fail('MusicXML is not well-formed XML.');
      position = end + ending.length; continue;
    }
    let end = position + 1; let quote = '';
    for (; end < xml.length; end++) {
      const char = xml[end]!;
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === xml.length) fail('MusicXML is not well-formed XML.');
    if (xml[position + 1] === '/') depth--;
    else {
      depth++;
      if (depth > 32) fail('MusicXML is nested too deeply.');
      if (xml.slice(position, end).trimEnd().endsWith('/')) depth--;
    }
    if (depth < 0) fail('MusicXML is not well-formed XML.');
    position = end + 1;
  }
}

const kinds: Record<string, string> = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7',
  'minor-seventh': 'm7', 'diminished-seventh': 'dim7', 'augmented-seventh': 'aug7', 'half-diminished': 'm7b5',
  'major-minor': 'mMaj7', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9',
  'minor-ninth': 'm9', 'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11',
  'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5',
};
function chordPitch(node: Element, prefix: 'root' | 'bass'): string {
  allowed(node, [`${prefix}-step`, `${prefix}-alter`]);
  const step = text(node, `${prefix}-step`);
  if (!/^[A-G]$/.test(step)) fail('Unsupported chord root or bass.');
  const alter = integer(text(node, `${prefix}-alter`, '0'), -1, 1);
  return step + (alter === -1 ? 'b' : alter === 1 ? '#' : '');
}
function harmony(node: Element): string | null {
  allowed(node, ['root', 'kind', 'bass', 'inversion', 'offset', 'staff', 'frame', 'footnote', 'level']);
  const kind = text(node, 'kind');
  if (kind === 'none') return null;
  if (!Object.hasOwn(kinds, kind)) fail('This MusicXML chord kind is not supported.');
  const root = chordPitch(one(node, 'root', true)!, 'root');
  const bass = one(node, 'bass');
  if (integer(text(node, 'inversion', '0'), 0, 10) !== 0 && !bass) fail('Chord inversions require an explicit bass pitch.');
  return root + kinds[kind] + (bass ? `/${chordPitch(bass, 'bass')}` : '');
}

function readMusicXml(xml: string): LeadSheet {
  checkXmlBounds(xml);
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.doctype) fail('MusicXML is not well-formed XML.');
  const root = document.documentElement;
  if (root.localName !== 'score-partwise') fail('Only score-partwise MusicXML is supported.');
  const stack: { node: Element; depth: number }[] = [{ node: root, depth: 1 }]; let nodeCount = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodeCount > 20_000 || item.depth > 32) fail('MusicXML exceeds the XML complexity limit.');
    if (item.node.namespaceURI && item.node.namespaceURI !== 'http://www.musicxml.org/ns/musicxml') fail('External XML namespaces are not supported.');
    for (const node of children(item.node)) stack.push({ node, depth: item.depth + 1 });
  }
  allowed(root, ['work', 'movement-number', 'movement-title', 'identification', 'defaults', 'credit', 'part-list', 'part']);
  const part = one(root, 'part', true)!;
  const parts = one(root, 'part-list', true)!;
  allowed(parts, ['score-part']);
  const definition = one(parts, 'score-part', true)!;
  if (!part.getAttribute('id') || part.getAttribute('id') !== definition.getAttribute('id')) fail('MusicXML must contain exactly one matching part.');
  allowed(part, ['measure']);
  const bars = children(part);
  if (bars.length < 1 || bars.length > 256) fail('Import between 1 and 256 measures.');
  const work = one(root, 'work');
  const title = text(root, 'movement-title', work ? text(work, 'work-title', 'Imported lead sheet') : 'Imported lead sheet');
  if (![...title].length || [...title].length > 200 || [...title].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail('The imported title must contain 1–200 characters.');
  let key: KeySignature = 'C'; let time: TimeSignature = { numerator: 4, denominator: 4 }; let divisions = 0;
  let voice: string | undefined; let carriedChord: string | null = null;
  let pendingTie: { pitch: Pitch; end: number } | undefined;
  const measures: LeadSheet['measures'] = [];
  const staffAndVoice = (node: Element) => {
    if (text(node, 'staff', '1') !== '1') fail('Only one treble staff is supported.');
    const currentVoice = text(node, 'voice', '1');
    if (!currentVoice || (voice && voice !== currentVoice)) fail('Only one melody voice is supported.');
    voice = currentVoice;
  };
  for (const [barIndex, bar] of bars.entries()) {
    if (bar.getAttribute('implicit') === 'yes') fail('Pickup measures are not supported yet.');
    allowed(bar, ['attributes', 'note', 'harmony', 'forward', 'print', 'barline', 'direction', 'sound']);
    let cursor = 0; const melody: MelodyEvent[] = []; const changes: { offset: number; symbol: string | null }[] = [];
    for (const element of children(bar)) {
      if (element.localName === 'attributes') {
        if (cursor !== 0 || melody.length || changes.length) fail('Musical attributes must occur at the start of a measure.');
        allowed(element, ['divisions', 'key', 'time', 'staves', 'clef']);
        if (one(element, 'divisions')) divisions = integer(text(element, 'divisions'), 1, 1_000_000);
        if (text(element, 'staves', '1') !== '1') fail('Only one treble staff is supported.');
        const keyNode = one(element, 'key');
        if (keyNode) {
          if ((keyNode.getAttribute('number') ?? '1') !== '1') fail('Only one treble staff is supported.');
          allowed(keyNode, ['fifths', 'mode', 'cancel']);
          const fifths = integer(text(keyNode, 'fifths'), -7, 7); const mode = text(keyNode, 'mode', 'major');
          const next = Object.entries(KEY_SIGNATURES).find(([, value]) => value.fifths === fifths && value.mode === mode)?.[0] as KeySignature | undefined;
          if (!next) fail('Only standard major and minor keys are supported.');
          if (barIndex > 0 && key !== next) fail('Key changes within a sheet are not supported.');
          key = next;
        }
        const timeNode = one(element, 'time');
        if (timeNode) {
          if ((timeNode.getAttribute('number') ?? '1') !== '1') fail('Only one treble staff is supported.');
          allowed(timeNode, ['beats', 'beat-type']);
          const numerator = integer(text(timeNode, 'beats'), 1, 12); const denominator = integer(text(timeNode, 'beat-type'), 2, 8);
          if (![2, 4, 8].includes(denominator)) fail('Supported meter denominators are 2, 4 and 8.');
          if (barIndex > 0 && (time.numerator !== numerator || time.denominator !== denominator)) fail('Meter changes within a sheet are not supported.');
          time = { numerator, denominator: denominator as TimeSignature['denominator'] };
        }
        const clef = one(element, 'clef');
        if (clef) {
          allowed(clef, ['sign', 'line', 'clef-octave-change']);
          if (text(clef, 'sign') !== 'G' || text(clef, 'line') !== '2' || text(clef, 'clef-octave-change', '0') !== '0' || (clef.getAttribute('number') ?? '1') !== '1') fail('Only an untransposed treble clef is supported.');
        }
      } else if (element.localName === 'note' || element.localName === 'forward') {
        if (!divisions) fail('MusicXML must define divisions before its notes.');
        staffAndVoice(element);
        const ticks = integer(text(element, 'duration'), 1, 1_000_000) * 480 / divisions;
        if (!Number.isInteger(ticks)) fail('MusicXML rhythm cannot be represented at 480 ticks per quarter.');
        if (ticks > measureTicks({ timeSignature: time }) - cursor) fail('MusicXML events extend past a measure boundary.');
        if (element.localName === 'forward') { allowed(element, ['duration', 'voice', 'staff']); cursor += ticks; continue; }
        allowed(element, ['pitch', 'rest', 'duration', 'tie', 'voice', 'type', 'dot', 'accidental', 'stem', 'staff', 'beam', 'notations', 'lyric']);
        if (['attack', 'release', 'time-only'].some(attribute => element.hasAttribute(attribute))) fail('Performance timing changes are not supported.');
        const type = text(element, 'type', '');
        const denominator = ({ whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16 } as Record<string, number>)[type];
        const dots = children(element).filter(child => child.localName === 'dot').length;
        const measureRest = one(element, 'rest')?.getAttribute('measure') === 'yes';
        if (measureRest && (cursor !== 0 || ticks !== measureTicks({ timeSignature: time }))) fail('A full-measure rest must fill its measure.');
        let duration: NoteDuration | undefined;
        if (measureRest || (!type && dots === 0)) duration = ([1, 2, 4, 8, 16] as const).flatMap(denominator => ([0, 1] as const).map(dots => ({ denominator, dots }))).find(candidate => durationTicks(candidate) === ticks);
        else if (denominator && dots <= 1) duration = { denominator: denominator as NoteDuration['denominator'], dots: dots as 0 | 1 };
        if (!duration || durationTicks(duration) !== ticks) fail('Only whole through sixteenth notes with at most one dot are supported; tuplets are not supported.');
        const pitchNode = one(element, 'pitch'); const rest = one(element, 'rest');
        if (!!pitchNode === !!rest) fail('Each note must contain one pitch or rest.');
        let pitch: Pitch | undefined;
        if (pitchNode) {
          allowed(pitchNode, ['step', 'alter', 'octave']);
          const step = text(pitchNode, 'step');
          if (!/^[A-G]$/.test(step)) fail('Invalid MusicXML pitch.');
          pitch = { step: step as Pitch['step'], alter: integer(text(pitchNode, 'alter', '0'), -1, 1) as Pitch['alter'], octave: integer(text(pitchNode, 'octave'), 3, 6) as Pitch['octave'] };
        }
        if (rest) allowed(rest, ['display-step', 'display-octave']);
        if (!['', 'sharp', 'flat', 'natural'].includes(text(element, 'accidental', ''))) fail('Only sharp, flat and natural accidentals are supported.');
        const ties = children(element).filter(child => child.localName === 'tie').map(child => child.getAttribute('type'));
        for (const notation of children(element).filter(child => child.localName === 'notations')) {
          allowed(notation, ['tied']);
          for (const tied of children(notation)) ties.push(tied.getAttribute('type'));
        }
        if (ties.some(tie => tie !== 'start' && tie !== 'stop') || (ties.length && !pitch)) fail('Unsupported MusicXML tie.');
        const start = barIndex * measureTicks({ timeSignature: time }) + cursor;
        if (pendingTie && (!ties.includes('stop') || !pitch || JSON.stringify(pitch) !== JSON.stringify(pendingTie.pitch) || start !== pendingTie.end)) fail('Ties must join adjacent notes with the same pitch.');
        if (ties.includes('stop') && !pendingTie) fail('A tie stop has no matching start.');
        pendingTie = ties.includes('start') ? { pitch: pitch!, end: start + ticks } : undefined;
        const base = { id: `note-${barIndex + 1}-${melody.length + 1}`, offsetTicks: cursor, duration };
        melody.push(pitch ? { ...base, kind: 'note', pitch, ...(ties.includes('start') ? { tieToNext: true } : {}) } : { ...base, kind: 'rest' });
        cursor += ticks;
      } else if (element.localName === 'harmony') {
        if (text(element, 'staff', '1') !== '1') fail('Only one treble staff is supported.');
        const rawOffset = integer(text(element, 'offset', '0'), -1_000_000, 1_000_000);
        if (rawOffset && !divisions) fail('MusicXML must define divisions before chord offsets.');
        const offset = cursor + (rawOffset ? rawOffset * 480 / divisions : 0);
        if (!Number.isInteger(offset) || offset < 0 || (changes.length && offset <= changes[changes.length - 1]!.offset)) fail('Chord symbols must have distinct, ordered positions within a measure.');
        changes.push({ offset, symbol: harmony(element) });
      } else if (element.localName === 'barline') {
        allowed(element, ['bar-style', 'footnote', 'level']);
      } else if (element.localName === 'direction') {
        allowed(element, ['direction-type', 'offset', 'voice', 'staff', 'sound']);
        for (const direction of children(element).filter(child => child.localName === 'direction-type')) allowed(direction, ['words', 'rehearsal', 'metronome', 'dynamics', 'wedge']);
        const sound = one(element, 'sound');
        if (sound) validateSound(sound);
      } else if (element.localName === 'sound') validateSound(element);
    }
    const barTicks = measureTicks({ timeSignature: time });
    if (cursor > barTicks || changes.some(change => change.offset >= barTicks)) fail('MusicXML events extend past a measure boundary.');
    if (carriedChord !== null && (!changes.length || changes[0]!.offset > 0)) changes.unshift({ offset: 0, symbol: carriedChord });
    const chords: ChordEvent[] = [];
    changes.forEach((change, index) => {
      if (change.symbol !== null) chords.push({ id: `chord-${barIndex + 1}-${index + 1}`, offsetTicks: change.offset, durationTicks: (changes[index + 1]?.offset ?? barTicks) - change.offset, symbol: change.symbol });
      carriedChord = change.symbol;
    });
    measures.push({ id: `measure-${barIndex + 1}`, chords, melody });
  }
  if (pendingTie) fail('The final tie has no matching following note.');
  return parseScore({ schemaVersion: 2, id: 'import-score', title, keySignature: key, timeSignature: time, ticksPerQuarter: 480, measures });
}
function validateSound(node: Element): void {
  if (children(node).length || Array.from(node.attributes).some(attribute => !['tempo', 'dynamics'].includes(attribute.name))) fail('MusicXML playback navigation and instrument changes are not supported.');
}
function checkJsonBounds(source: string): void {
  let depth = 0; let quoted = false; let escaped = false;
  for (const character of source) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > 32) fail('The score JSON is nested too deeply.');
    } else if (character === '}' || character === ']') depth--;
  }
}
function strictJson(source: string): unknown {
  checkJsonBounds(source);
  const value: unknown = JSON.parse(source);
  // JSON.parse discards duplicate names. Walk its already-valid source to reject
  // ambiguous objects consistently with native, including escaped key spellings.
  let position = 0;
  const whitespace = () => { while (/\s/.test(source[position] ?? '') && position < source.length) position++; };
  const string = (): string => {
    const start = position++;
    while (source[position] !== '"') { if (source[position] === '\\') position++; position++; }
    return JSON.parse(source.slice(start, ++position)) as string;
  };
  const scan = (): void => {
    whitespace();
    const first = source[position];
    if (first === '{') {
      position++; whitespace(); const keys = new Set<string>();
      while (source[position] !== '}') {
        const key = string();
        if (keys.has(key)) fail('Duplicate JSON field names are not allowed.');
        keys.add(key); whitespace(); position++; scan(); whitespace();
        if (source[position] !== ',') break;
        position++; whitespace();
      }
      position++;
    } else if (first === '[') {
      position++; whitespace();
      while (source[position] !== ']') {
        scan(); whitespace();
        if (source[position] !== ',') break;
        position++;
      }
      position++;
    } else if (first === '"') string();
    else while (position < source.length && !/[\s,\]}]/.test(source[position]!)) position++;
  };
  scan(); return value;
}

/** Converts a bounded local file only; never resolves URLs, entities, or remote resources. */
export function importScore(source: string, fileName: string): ImportedScore {
  if (source.length > MAX_IMPORT_BYTES || new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) fail('Choose a file no larger than 1 MiB.');
  const extension = fileName.toLowerCase().split('.').at(-1);
  if (!['json', 'xml', 'musicxml'].includes(extension ?? '')) fail('Choose a ChordViewer .json or uncompressed .musicxml/.xml file. Compressed .mxl is not supported.');
  try {
    if (extension === 'json') {
      return { score: parseScore(strictJson(source.replace(/^\uFEFF/, ''))), warnings: [], format: 'json' };
    }
    return { score: readMusicXml(source.replace(/^\uFEFF/, '')), warnings: ['Lyrics, visual layout, dynamics and performance metadata are not imported. Missing key or meter uses C major or 4/4.'], format: 'musicxml' };
  } catch (error) {
    if (error instanceof ScoreImportError) throw error;
    fail(extension === 'json' ? 'This is not a supported ChordViewer score JSON document.' : 'MusicXML contains invalid or unsupported score notation.');
  }
}
