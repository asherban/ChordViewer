import { describe, it, expect } from 'vitest'
import { normalizeChord, matchesExpected } from './chordMatch'

describe('normalizeChord', () => {
  it('lowercases chord names', () => {
    expect(normalizeChord('Cmaj7')).toBe('cmaj7')
  })

  it('converts min to m', () => {
    expect(normalizeChord('Cmin7')).toBe('cm7')
  })

  it('does not convert "minor" (only "min" not followed by "or")', () => {
    expect(normalizeChord('Cminor7')).toBe('cminor7')
  })

  it('converts ♭ glyph to b', () => {
    expect(normalizeChord('C♭7')).toBe('cb7')
  })

  it('converts ♯ glyph to #', () => {
    expect(normalizeChord('C♯7')).toBe('c#7')
  })

  it('trims whitespace', () => {
    expect(normalizeChord('  Cmaj7  ')).toBe('cmaj7')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeChord('')).toBe('')
  })

  it('preserves maj casing (lowercased)', () => {
    expect(normalizeChord('CMAJor7')).toBe('cmajor7')
  })
})

describe('matchesExpected', () => {
  it('returns true for identical chords', () => {
    expect(matchesExpected('Cmaj7', 'Cmaj7')).toBe(true)
  })

  it('normalizes before comparing (min → m)', () => {
    expect(matchesExpected('Cm7', 'Cmin7')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesExpected('cmaj7', 'Cmaj7')).toBe(true)
  })

  it('ignores bass note in detected chord when expected has no slash', () => {
    expect(matchesExpected('C', 'C/E')).toBe(true)
  })

  it('requires exact match when expected has a slash', () => {
    expect(matchesExpected('C/E', 'C')).toBe(false)
  })

  it('matches slash chord to slash chord', () => {
    expect(matchesExpected('C/E', 'C/E')).toBe(true)
  })

  it('returns false when expected is null', () => {
    expect(matchesExpected(null, 'C')).toBe(false)
  })

  it('returns false when detected is null', () => {
    expect(matchesExpected('C', null)).toBe(false)
  })

  it('returns false when both are null', () => {
    expect(matchesExpected(null, null)).toBe(false)
  })

  it('returns false for different chords', () => {
    expect(matchesExpected('C', 'G')).toBe(false)
  })
})
