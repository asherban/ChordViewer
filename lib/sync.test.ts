import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('./supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import {
  pullChart,
  pushChart,
  pullPreferences,
  pushPreferences,
  pullNotation,
  pushNotation,
  pullVideoHistory,
  pushVideoHistory,
} from './sync'

const USER_ID = 'user-123'

function makeQueryBuilder(response: { data: unknown; error: { message: string } | null }) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.single = vi.fn(() => Promise.resolve(response))
  b.maybeSingle = vi.fn(() => Promise.resolve(response))
  b.order = vi.fn(() => Promise.resolve(response))
  b.upsert = vi.fn(() => Promise.resolve({ error: null }))
  b.insert = vi.fn(() => Promise.resolve({ error: null }))
  b.delete = vi.fn(() => b)
  b.gte = vi.fn(() => Promise.resolve({ error: null }))
  return b
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe('pullChart', () => {
  it('returns Supabase data when available', async () => {
    const dbRow = { title: 'My Song', key: 'C', time_sig: '4/4', tempo: '120', bars: [[null, null]] }
    mockFrom.mockReturnValue(makeQueryBuilder({ data: dbRow, error: null }))
    const chart = await pullChart()
    expect(chart.meta.title).toBe('My Song')
    expect(chart.meta.time).toBe('4/4')
    expect(chart.bars).toEqual([[null, null]])
  })

  it('returns an empty chart when Supabase has no row', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }))
    const chart = await pullChart()
    expect(chart.meta.title).toBe('')
    expect(chart.bars).toHaveLength(8)
  })

  it('returns an empty chart when Supabase throws', async () => {
    mockFrom.mockImplementation(() => { throw new Error('unexpected') })
    const chart = await pullChart()
    expect(chart.meta.time).toBe('4/4')
  })
})

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

describe('pullPreferences', () => {
  it('maps DB preferences to app state', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({
      data: {
        notation: 'jazz',
        mode: 'Transcribe',
        current_video_id: 'abc12345678',
        current_video_start_sec: 30,
      },
      error: null,
    }))

    const preferences = await pullPreferences()
    expect(preferences).toEqual({
      notation: 'jazz',
      mode: 'Transcribe',
      currentVideo: { id: 'abc12345678', startSec: 30 },
    })
  })

  it('returns defaults when no row exists', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }))
    const preferences = await pullPreferences()
    expect(preferences).toEqual({ notation: 'regular', mode: 'Learn', currentVideo: null })
  })
})

describe('pushPreferences', () => {
  it('calls upsert with notation, mode, and current video', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    await pushPreferences({
      notation: 'jazz',
      mode: 'Play',
      currentVideo: { id: 'abc12345678', startSec: null },
    })
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        notation: 'jazz',
        mode: 'Play',
        current_video_id: 'abc12345678',
        current_video_start_sec: null,
      },
      expect.objectContaining({ onConflict: 'user_id' })
    )
  })
})

describe('notation compatibility helpers', () => {
  it('pullNotation returns notation from preferences', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({
      data: { notation: 'jazz', mode: 'Learn', current_video_id: null, current_video_start_sec: null },
      error: null,
    }))
    await expect(pullNotation()).resolves.toBe('jazz')
  })

  it('pushNotation preserves the other preference fields', async () => {
    const pullBuilder = makeQueryBuilder({
      data: {
        notation: 'regular',
        mode: 'Play',
        current_video_id: 'abc12345678',
        current_video_start_sec: 5,
      },
      error: null,
    })
    const pushBuilder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValueOnce(pullBuilder).mockReturnValueOnce(pushBuilder)

    await pushNotation('jazz')
    expect(pushBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notation: 'jazz',
        mode: 'Play',
        current_video_id: 'abc12345678',
        current_video_start_sec: 5,
      }),
      expect.objectContaining({ onConflict: 'user_id' })
    )
  })
})

describe('pullVideoHistory', () => {
  it('maps DB rows to VideoHistoryEntry shape', async () => {
    const rows = [{ youtube_id: 'abc123', start_sec: 30, label: 'https://youtu.be/abc123', title: 'Cool video' }]
    mockFrom.mockReturnValue(makeQueryBuilder({ data: rows, error: null }))
    const history = await pullVideoHistory()
    expect(history[0].id).toBe('abc123')
    expect(history[0].startSec).toBe(30)
    expect(history[0].title).toBe('Cool video')
  })

  it('returns an empty array when Supabase returns empty', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }))
    await expect(pullVideoHistory()).resolves.toEqual([])
  })
})

describe('pushVideoHistory', () => {
  it('deletes then inserts all entries for the current user', async () => {
    const builder = makeQueryBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)
    const history = [{ id: 'vid1', startSec: null, label: 'https://youtu.be/vid1' }]
    await pushVideoHistory(history)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('user_id', USER_ID)
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
