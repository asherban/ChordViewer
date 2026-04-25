import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock before importing ChordViewerApp
vi.mock('webmidi', () => ({
  WebMidi: { addListener: vi.fn(), removeListener: vi.fn() },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  }),
}))

vi.mock('../lib/midi', () => ({
  initMidi: vi.fn(() => Promise.resolve({ kind: 'ready', inputs: [] })),
  getInputDescriptors: vi.fn(() => []),
  getInputById: vi.fn(() => null),
  attachNoteListeners: vi.fn(() => () => {}),
}))

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

import { ChordViewerApp } from './ChordViewerApp'

beforeEach(() => {
  localStorage.clear()
})

describe('Learn tab', () => {
  it('shows chord display and staff even without a MIDI device connected', () => {
    const { container } = render(<ChordViewerApp />)
    // LearnView must render in Learn mode regardless of MIDI device state
    expect(container.querySelector('.chord-display')).toBeInTheDocument()
    expect(container.querySelector('.staff-display')).toBeInTheDocument()
  })
})
