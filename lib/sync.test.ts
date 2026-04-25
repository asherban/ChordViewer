import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase browser client before importing sync
const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('./supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { pullChart, pushChart, pullNotation, pushNotation, pullVideoHistory, pushVideoHistory } from './sync'

const USER_ID = 'user-123'

function makeQueryBuilder(response: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.single = vi.fn(() => Promise.resolve(response))
  b.order = vi.fn(() => Promise.resolve(response))
  b.upsert = vi.fn(() => Promise.resolve({ error: null }))
  b.insert = vi.fn(() => Promise.resolve({ error: null }))
  b.delete = vi.fn(() => b)
  b.gte = vi.fn(() => Promise.resolve({ error: null }))
  return b
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

// ── pullChart ─────────────────────────────────────────────────────────────────

describe('pullChart', () => {
  it('returns Supabase data when available', async () => {
    const dbRow = { title: 'My Song', key: 'C', time_sig: '4/4', tempo: '120', bars: [[null, null]] }
    mockFrom.mockReturnValue(makeQueryBuilder({ data: dbRow, error: null }))
    const chart = await pullChart()
    expect(chart.meta.title).toBe('My Song')
    expect(chart.meta.time).toBe('4/4')
    expect(chart.bars).toEqual([[null, null]])
  })

  it('falls back to localStorage when Supabase errors', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'network error' } }))
    const chart = await pullChart()
    // emptyChart is the localStorage fallback when nothing stored
    expect(Array.isArray(chart.bars)).toBe(true)
  })

  it('falls back to localStorage when an exception is thrown', async () => {
    mockFrom.mockImplementation(() => { throw new Error('unexpected') })
    const chart = await pullChart()
    expect(chart).toBeDefined()
  })
})

// ── pushChart ─────────────────────────────────────────────────────────────────

describe('pushChart', () => {
  it('calls upsert with mapped fields', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    await pushChart({ meta: { title: 'T', key: 'G', time: '3/4', tempo: '90' }, bars: [] })
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, name: 'default', time_sig: '3/4' }),
      expect.objectContaining({ onConflict: 'user_id,name' })
    )
  })

  it('does nothing when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    await pushChart({ meta: { title: '', key: '', time: '4/4', tempo: '120' }, bars: [] })
    expect(builder.upsert).not.toHaveBeenCalled()
  })
})

// ── pullNotation ──────────────────────────────────────────────────────────────

describe('pullNotation', () => {
  it('returns notation from Supabase', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: { notation: 'jazz' }, error: null }))
    const notation = await pullNotation()
    expect(notation).toBe('jazz')
  })

  it('returns null when no row exists', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'no rows' } }))
    const notation = await pullNotation()
    expect(notation).toBeNull()
  })
})

// ── pushNotation ──────────────────────────────────────────────────────────────

describe('pushNotation', () => {
  it('calls upsert with notation value', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    await pushNotation('jazz')
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: USER_ID, notation: 'jazz' },
      expect.objectContaining({ onConflict: 'user_id' })
    )
  })
})

// ── pullVideoHistory ──────────────────────────────────────────────────────────

describe('pullVideoHistory', () => {
  it('maps DB rows to VideoHistoryEntry shape', async () => {
    const rows = [{ youtube_id: 'abc123', start_sec: 30, label: 'https://youtu.be/abc123', title: 'Cool video' }]
    mockFrom.mockReturnValue(makeQueryBuilder({ data: rows, error: null }))
    const history = await pullVideoHistory()
    expect(history[0].id).toBe('abc123')
    expect(history[0].startSec).toBe(30)
    expect(history[0].title).toBe('Cool video')
  })

  it('falls back to localStorage when Supabase returns empty', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }))
    const history = await pullVideoHistory()
    expect(Array.isArray(history)).toBe(true)
  })
})

// ── pushVideoHistory ──────────────────────────────────────────────────────────

describe('pushVideoHistory', () => {
  it('deletes then inserts all entries', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    const history = [{ id: 'vid1', startSec: null, label: 'https://youtu.be/vid1' }]
    await pushVideoHistory(history)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ youtube_id: 'vid1', position: 0, user_id: USER_ID }),
    ])
  })

  it('skips insert when history is empty', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    await pushVideoHistory([])
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.insert).not.toHaveBeenCalled()
  })
})
