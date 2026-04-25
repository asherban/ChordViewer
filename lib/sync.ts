'use client'

import { createClient } from './supabase/client'
import { loadChart, saveChart, type LeadSheet } from './leadSheet'
import { type Notation } from './notation'
import { type VideoHistoryEntry } from './youtube'

export const SYNC_STORAGE_KEYS = {
  notation: 'cv_notation',
  videoHistory: 'cv_video_history',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function loadStoredNotation(): Notation {
  try {
    const v = localStorage.getItem(SYNC_STORAGE_KEYS.notation)
    return v === 'jazz' ? 'jazz' : 'regular'
  } catch {
    return 'regular'
  }
}

function loadStoredVideoHistory(): VideoHistoryEntry[] {
  try {
    const v = localStorage.getItem(SYNC_STORAGE_KEYS.videoHistory)
    return v ? (JSON.parse(v) as VideoHistoryEntry[]) : []
  } catch {
    return []
  }
}

// ── Chart ─────────────────────────────────────────────────────────────────────

export async function pullChart(): Promise<LeadSheet> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('chord_charts')
      .select('title, key, time_sig, tempo, bars')
      .eq('name', 'default')
      .single()

    if (error || !data) return loadChart()

    const chart: LeadSheet = {
      meta: { title: data.title, key: data.key, time: data.time_sig, tempo: data.tempo },
      bars: data.bars as (string | null)[][],
    }
    saveChart(chart)
    return chart
  } catch {
    return loadChart()
  }
}

export async function pushChart(chart: LeadSheet): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return
    const { error } = await supabase.from('chord_charts').upsert(
      { user_id: userId, name: 'default', title: chart.meta.title, key: chart.meta.key,
        time_sig: chart.meta.time, tempo: chart.meta.tempo, bars: chart.bars },
      { onConflict: 'user_id,name' }
    )
    if (error) console.warn('[sync] pushChart:', error.message)
  } catch { /* offline or unauthenticated — localStorage already saved */ }
}

// ── Notation ──────────────────────────────────────────────────────────────────

export async function pullNotation(): Promise<Notation | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('user_preferences')
      .select('notation')
      .single()

    if (error || !data) return null

    const notation = data.notation as Notation
    try { localStorage.setItem(SYNC_STORAGE_KEYS.notation, notation) } catch { /* ignore */ }
    return notation
  } catch {
    return loadStoredNotation()
  }
}

export async function pushNotation(notation: Notation): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, notation }, { onConflict: 'user_id' })
    if (error) console.warn('[sync] pushNotation:', error.message)
  } catch { /* offline or unauthenticated */ }
}

// ── Video History ─────────────────────────────────────────────────────────────

export async function pullVideoHistory(): Promise<VideoHistoryEntry[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('video_history')
      .select('youtube_id, start_sec, label, title')
      .order('position', { ascending: true })

    if (error || !data || data.length === 0) return loadStoredVideoHistory()

    const history: VideoHistoryEntry[] = data.map((row) => ({
      id: row.youtube_id as string,
      startSec: row.start_sec as number | null,
      label: row.label as string,
      title: (row.title ?? undefined) as string | undefined,
    }))
    try { localStorage.setItem(SYNC_STORAGE_KEYS.videoHistory, JSON.stringify(history)) } catch { /* ignore */ }
    return history
  } catch {
    return loadStoredVideoHistory()
  }
}

export async function pushVideoHistory(history: VideoHistoryEntry[]): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return

    // Replace strategy: delete all then insert (history is at most 5 entries)
    await supabase.from('video_history').delete().gte('position', 0)

    if (history.length === 0) return

    const rows = history.map((entry, position) => ({
      user_id: userId,
      youtube_id: entry.id,
      start_sec: entry.startSec ?? null,
      label: entry.label,
      title: entry.title ?? null,
      position,
    }))
    const { error } = await supabase.from('video_history').insert(rows)
    if (error) console.warn('[sync] pushVideoHistory:', error.message)
  } catch { /* offline or unauthenticated */ }
}
