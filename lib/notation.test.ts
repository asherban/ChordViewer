import { describe, it, expect } from 'vitest'
import { toJazzNotation, applyNotation } from './notation'

describe('toJazzNotation', () => {
  it('converts maj7 to Δ7', () => {
    expect(toJazzNotation('Cmaj7')).toBe('CΔ7')
  })

  it('converts m7 to -7', () => {
    expect(toJazzNotation('Fm7')).toBe('F-7')
  })

  it('converts m7b5 to ø7', () => {
    expect(toJazzNotation('Bbm7b5')).toBe('Bbø7')
  })

  it('converts dim7 to °7', () => {
    expect(toJazzNotation('Cdim7')).toBe('C°7')
  })

  it('converts dim to °', () => {
    expect(toJazzNotation('Cdim')).toBe('C°')
  })

  it('converts aug to +', () => {
    expect(toJazzNotation('Caug')).toBe('C+')
  })

  it('converts m/ma7 to -Δ7', () => {
    expect(toJazzNotation('Cm/ma7')).toBe('C-Δ7')
  })

  it('converts m9 to -9', () => {
    expect(toJazzNotation('Dm9')).toBe('D-9')
  })

  it('converts maj9 to Δ9', () => {
    expect(toJazzNotation('Fmaj9')).toBe('FΔ9')
  })

  it('converts maj13 to Δ13', () => {
    expect(toJazzNotation('Gmaj13')).toBe('GΔ13')
  })

  it('leaves dominant 7 unchanged', () => {
    expect(toJazzNotation('Bb7')).toBe('Bb7')
  })

  it('converts plain major (M suffix) to root only', () => {
    // "C" has no quality suffix — the M → '' mapping only applies when quality is exactly "M"
    expect(toJazzNotation('CM')).toBe('C')
  })

  it('leaves unrecognised quality unchanged', () => {
    expect(toJazzNotation('Csus4')).toBe('Csus4')
  })

  it('handles flat root notes', () => {
    expect(toJazzNotation('Bbmaj7')).toBe('BbΔ7')
  })

  it('handles sharp root notes', () => {
    expect(toJazzNotation('F#m7')).toBe('F#-7')
  })

  it('returns input unchanged for non-chord strings', () => {
    expect(toJazzNotation('')).toBe('')
    expect(toJazzNotation('123')).toBe('123')
  })
})

describe('applyNotation', () => {
  it('converts to jazz when notation is jazz', () => {
    expect(applyNotation('Cmaj7', 'jazz')).toBe('CΔ7')
  })

  it('leaves chord unchanged when notation is regular', () => {
    expect(applyNotation('Cmaj7', 'regular')).toBe('Cmaj7')
  })

  it('handles non-jazz chords with jazz notation', () => {
    expect(applyNotation('Bb7', 'jazz')).toBe('Bb7')
  })
})
