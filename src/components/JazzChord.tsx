import { applyNotation, type Notation } from '../lib/notation';

interface ParsedChord {
  root: string;
  qGlyph: string;
  ext: string;
  bass: string | null;
}

function parseChordJazz(raw: string): ParsedChord | null {
  if (!raw) return null;
  let s = raw
    .replace(/^([A-G])b/, '$1♭')
    .replace(/^([A-G])#/, '$1♯')
    .replace(/\/([A-G])b/, '/$1♭')
    .replace(/\/([A-G])#/, '/$1♯')
    .replace(/b(\d)/g, '♭$1')
    .replace(/#(\d)/g, '♯$1');

  let bass: string | null = null;
  const slash = s.indexOf('/');
  if (slash > 0) {
    bass = s.slice(slash + 1);
    s = s.slice(0, slash);
  }

  const rm = s.match(/^([A-G][♯♭]?)/);
  if (!rm) return null;
  const root = rm[0];
  let rest = s.slice(root.length);

  let qGlyph = '';
  if (/^maj7|^M7|^Δ7|^Δ/.test(rest)) {
    qGlyph = 'Δ';
    rest = rest.replace(/^maj7|^M7|^Δ7?/, '');
  } else if (/^m7♭5|^mi7♭5|^m7b5|^ø/.test(rest)) {
    qGlyph = 'ø';
    rest = rest.replace(/^m7♭5|^mi7♭5|^m7b5|^ø7?/, '');
  } else if (/^dim7|^dim|^°/.test(rest)) {
    qGlyph = '°';
    rest = rest.replace(/^dim7|^dim|^°7?/, '');
  } else if (/^m(?!aj)|^mi(?!n)|^−/.test(rest)) {
    qGlyph = '−';
    rest = rest.replace(/^m(?!aj)|^mi(?!n)|^−/, '');
  } else if (/^aug|^\+/.test(rest)) {
    qGlyph = '+';
    rest = rest.replace(/^aug|^\+/, '');
  }

  return { root, qGlyph, ext: rest.trim(), bass };
}

interface Props {
  chord: string;
  fontSize: number;
  notation: Notation;
  color?: string;
}

export function JazzChord({ chord, fontSize, notation, color }: Props) {
  if (!chord) {
    return <span style={{ color: 'var(--color-muted)', fontSize: fontSize * 0.6 }}>·</span>;
  }

  if (notation === 'regular') {
    const display = applyNotation(chord, 'regular');
    return (
      <span style={{
        fontFamily: 'var(--chord-font, "Inter", system-ui, sans-serif)',
        fontSize,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        color: color ?? 'inherit',
        whiteSpace: 'nowrap',
      }}>{display}</span>
    );
  }

  const p = parseChordJazz(chord);
  if (!p) {
    return <span style={{ fontSize, color: color ?? 'inherit' }}>{chord}</span>;
  }

  return (
    <span style={{
      fontFamily: 'var(--chord-font, "Inter", system-ui, sans-serif)',
      fontSize,
      fontWeight: 500,
      letterSpacing: '-0.025em',
      lineHeight: 1,
      color: color ?? 'inherit',
      display: 'inline-flex',
      alignItems: 'baseline',
      whiteSpace: 'nowrap',
    }}>
      <span>{p.root}</span>
      {p.qGlyph && (
        <span style={{
          fontSize: p.qGlyph === '−' ? fontSize * 0.55 : fontSize * 0.7,
          marginLeft: p.qGlyph === '−' ? 1 : 0,
          transform: p.qGlyph === '−' ? 'translateY(-0.25em)' : 'none',
          display: 'inline-block',
          fontWeight: 400,
        }}>{p.qGlyph}</span>
      )}
      {p.ext && (
        <span style={{
          fontSize: fontSize * 0.52,
          marginLeft: 1,
          transform: 'translateY(-0.5em)',
          display: 'inline-block',
          fontWeight: 500,
          opacity: 0.9,
        }}>{p.ext}</span>
      )}
      {p.bass && (
        <>
          <span style={{ fontSize: fontSize * 0.7, opacity: 0.5, margin: '0 1px' }}>/</span>
          <span style={{ fontSize: fontSize * 0.65, opacity: 0.85 }}>{p.bass}</span>
        </>
      )}
    </span>
  );
}
