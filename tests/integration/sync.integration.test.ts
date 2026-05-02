import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTestUser, deleteTestUser, queryRows, type TestUser } from '../_shared/supabase'

// vi.mock is hoisted before imports, so createClient() in lib/sync.ts gets our
// factory instead of the real browser client for every call in this test file.
let getClient: () => SupabaseClient

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => getClient(),
}))

// Import sync functions AFTER vi.mock so they receive the mocked createClient.
const { pushChart, pullChart, pushNotation, pullNotation, pushVideoHistory, pullVideoHistory } =
  await import('@/lib/sync')

let user: TestUser

beforeEach(async () => {
  user = await createTestUser()
  getClient = () => user.client
})

afterEach(async () => {
  await deleteTestUser(user.id)
})

// ── pushChart / pullChart ─────────────────────────────────────────────────────

describe('pushChart + pullChart', () => {
  it('persists a chart and reads it back', async () => {
    const chart = { meta: { title: 'My Song', key: 'C', time: '4/4', tempo: '120' }, bars: [['Cmaj7', null]] }
    await pushChart(chart)

    const rows = await queryRows('chord_charts', { user_id: user.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'My Song', key: 'C', time_sig: '4/4' })

    const pulled = await pullChart()
    expect(pulled.meta.title).toBe('My Song')
    expect(pulled.bars).toEqual([['Cmaj7', null]])
  })

  it('upserts on a second push — no duplicate row', async () => {
    const chart = { meta: { title: 'A', key: 'G', time: '3/4', tempo: '90' }, bars: [] }
    await pushChart(chart)
    await pushChart({ ...chart, meta: { ...chart.meta, title: 'B' } })

    const rows = await queryRows('chord_charts', { user_id: user.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'B' })
  })
})

// ── pushNotation / pullNotation ───────────────────────────────────────────────

describe('pushNotation + pullNotation', () => {
  it('persists notation and reads it back', async () => {
    await pushNotation('jazz')

    const rows = await queryRows('user_preferences', { user_id: user.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ notation: 'jazz' })

    const pulled = await pullNotation()
    expect(pulled).toBe('jazz')
  })
})

// ── pushVideoHistory / pullVideoHistory ───────────────────────────────────────

describe('pushVideoHistory + pullVideoHistory', () => {
  it('persists history in order and reads it back', async () => {
    const history = [
      { id: 'abc', startSec: 30, label: 'https://youtu.be/abc', title: 'Cool' },
      { id: 'def', startSec: null, label: 'https://youtu.be/def' },
    ]
    await pushVideoHistory(history)

    const rows = await queryRows('video_history', { user_id: user.id })
    expect(rows).toHaveLength(2)

    const pulled = await pullVideoHistory()
    expect(pulled[0].id).toBe('abc')
    expect(pulled[0].startSec).toBe(30)
    expect(pulled[1].id).toBe('def')
  })

  it('replaces history on a second push', async () => {
    await pushVideoHistory([{ id: 'old', startSec: null, label: 'https://youtu.be/old' }])
    await pushVideoHistory([{ id: 'new', startSec: null, label: 'https://youtu.be/new' }])

    const rows = await queryRows('video_history', { user_id: user.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ youtube_id: 'new' })
  })
})

// ── RLS isolation ─────────────────────────────────────────────────────────────

describe('RLS: users cannot see each other\'s data', () => {
  it("user A's chart is invisible to user B", async () => {
    await pushChart({ meta: { title: 'Secret', key: 'A', time: '4/4', tempo: '120' }, bars: [] })

    const userB = await createTestUser()
    try {
      getClient = () => userB.client
      const pulled = await pullChart()
      // pullChart falls back to emptyChart when no DB row found for this user
      expect(pulled.meta.title).not.toBe('Secret')
    } finally {
      getClient = () => user.client
      await deleteTestUser(userB.id)
    }
  })
})
