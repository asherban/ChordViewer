'use client'

import { createClient } from './supabase/client'
import { emptyChart, type LeadSheet } from './leadSheet'
import { type Notation } from './notation'
import { type VideoHistoryEntry } from './youtube'

type AppMode = 'Learn' | 'Transcribe' | 'Play'

export interface CurrentVideo {
  id: string
  startSec: number | null
}

export interface UserPreferences {
  notation: Notation
  mode: AppMode
  currentVideo: CurrentVideo | null
}

const DEFAULT_PREFERENCES: UserPreferences = {
  notation: 'regular',
  mode: 'Learn',
  currentVideo: null,
}

async function getUserId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function isNotation(value: unknown): value is Notation {
  return value === 'regular' || value === 'jazz'
}

function isAppMode(value: unknown): value is AppMode {
  return value === 'Learn' || value === 'Transcribe' || value === 'Play'
}

export function defaultPreferences(): UserPreferences {
  return { ...DEFAULT_PREFERENCES }
}

export async function pullChart(): Promise<LeadSheet> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('chord_charts')
      .select('title, key, time_sig, tempo, bars')
      .eq('name', 'default')
      .maybeSingle()

    if (error || !data) return emptyChart()

    return {
      meta: { title: data.title, key: data.key, time: data.time_sig, tempo: data.tempo },
      bars: data.bars as (string | null)[][],
    }
  } catch (error) {
    console.warn('[sync] pullChart:', error)
    return emptyChart()
  }
}

export async function pushChart(chart: LeadSheet): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return
    const { error } = await supabase.from('chord_charts').upsert(
      {
        user_id: userId,
        name: 'default',
        title: chart.meta.title,
        key: chart.meta.key,
        time_sig: chart.meta.time,
        tempo: chart.meta.tempo,
        bars: chart.bars,
      },
      { onConflict: 'user_id,name' }
    )
    if (error) console.warn('[sync] pushChart:', error.message)
  } catch (error) {
    console.warn('[sync] pushChart:', error)
  }
}

export async function pullPreferences(): Promise<UserPreferences> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('user_preferences')
      .select('notation, mode, current_video_id, current_video_start_sec')
      .maybeSingle()

    if (error || !data) return defaultPreferences()

    return {
      notation: isNotation(data.notation) ? data.notation : DEFAULT_PREFERENCES.notation,
      mode: isAppMode(data.mode) ? data.mode : DEFAULT_PREFERENCES.mode,
      currentVideo: typeof data.current_video_id === 'string' && data.current_video_id.length > 0
        ? { id: data.current_video_id, startSec: data.current_video_start_sec as number | null }
        : null,
    }
  } catch (error) {
    console.warn('[sync] pullPreferences:', error)
    return defaultPreferences()
  }
}

export async function pushPreferences(preferences: UserPreferences): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return

    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          notation: preferences.notation,
          mode: preferences.mode,
          current_video_id: preferences.currentVideo?.id ?? null,
          current_video_start_sec: preferences.currentVideo?.startSec ?? null,
        },
        { onConflict: 'user_id' }
      )
    if (error) console.warn('[sync] pushPreferences:', error.message)
  } catch (error) {
    console.warn('[sync] pushPreferences:', error)
  }
}

export async function pullNotation(): Promise<Notation | null> {
  return (await pullPreferences()).notation
}

export async function pushNotation(notation: Notation): Promise<void> {
  const preferences = await pullPreferences()
  await pushPreferences({ ...preferences, notation })
}

export async function pullVideoHistory(): Promise<VideoHistoryEntry[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('video_history')
      .select('youtube_id, start_sec, label, title')
      .order('position', { ascending: true })

    if (error || !data) return []

    return data.map((row) => ({
      id: row.youtube_id as string,
      startSec: row.start_sec as number | null,
      label: row.label as string,
      title: (row.title ?? undefined) as string | undefined,
    }))
  } catch (error) {
    console.warn('[sync] pullVideoHistory:', error)
    return []
  }
}

export async function pushVideoHistory(history: VideoHistoryEntry[]): Promise<void> {
  try {
    const supabase = createClient()
    const userId = await getUserId(supabase)
    if (!userId) return

    const { error: deleteError } = await supabase
      .from('video_history')
      .delete()
      .eq('user_id', userId)
    if (deleteError) {
      console.warn('[sync] pushVideoHistory delete:', deleteError.message)
      return
    }

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
  } catch (error) {
    console.warn('[sync] pushVideoHistory:', error)
  }
}
