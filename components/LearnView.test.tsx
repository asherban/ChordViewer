import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LearnView } from './LearnView'

// VexFlow uses browser SVG APIs not fully available in jsdom
vi.mock('vexflow', () => {
  function makeStub() {
    return {
      setContext: vi.fn().mockReturnThis(),
      draw: vi.fn(),
      addClef: vi.fn().mockReturnThis(),
      getNoteStartX: vi.fn(() => 0),
      setType: vi.fn().mockReturnThis(),
      addModifier: vi.fn(),
      setMode: vi.fn().mockReturnThis(),
      addTickable: vi.fn(),
      joinVoices: vi.fn().mockReturnThis(),
      format: vi.fn(),
    }
  }
  function MockRenderer() {
    return { resize: vi.fn(), getContext: vi.fn(() => ({ setFillStyle: vi.fn(), setStrokeStyle: vi.fn() })) }
  }
  MockRenderer.Backends = { SVG: 1 }
  return {
    Renderer: MockRenderer,
    Stave: function() { return makeStub() },
    StaveNote: function() { return makeStub() },
    Voice: function() { return makeStub() },
    VoiceMode: { SOFT: 1 },
    Formatter: function() { return makeStub() },
    StaveConnector: function() { return makeStub() },
    Accidental: function() {},
  }
})

const emptyResult = { chord: null, candidates: [], noteNames: [] }

describe('LearnView', () => {
  it('always renders chord display and staff with no active notes', () => {
    const { container } = render(
      <LearnView
        chordResult={emptyResult}
        activeNotes={new Set()}
        sustainPedalActive={false}
        notation="regular"
      />
    )
    expect(container.querySelector('.chord-display')).toBeInTheDocument()
    expect(container.querySelector('.staff-display')).toBeInTheDocument()
  })

  it('always renders chord display and staff with active notes', () => {
    const { container } = render(
      <LearnView
        chordResult={{ chord: 'CM', candidates: ['CM'], noteNames: ['C', 'E', 'G'] }}
        activeNotes={new Set([60, 64, 67])}
        sustainPedalActive={false}
        notation="regular"
      />
    )
    expect(container.querySelector('.chord-display')).toBeInTheDocument()
    expect(container.querySelector('.staff-display')).toBeInTheDocument()
  })
})
