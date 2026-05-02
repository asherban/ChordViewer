import type { Page } from '@playwright/test'
import { createTestUser, deleteTestUser, queryRows, serviceClient, type TestUser } from '../_shared/supabase'
import type { LeadSheet } from '@/lib/leadSheet'

export type { TestUser }

/** Create a test user and sign them in via the real login form. Returns a cleanup fn. */
export async function setupTestUser(page: Page): Promise<{ user: TestUser; cleanup: () => Promise<void> }> {
  const user = await createTestUser()

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')

  return {
    user,
    async cleanup() {
      await deleteTestUser(user.id)
    },
  }
}

/** Seed a chord chart for a user via the service client (bypasses RLS). */
export async function seedChart(userId: string, chart: LeadSheet): Promise<void> {
  const { error } = await serviceClient().from('chord_charts').insert({
    user_id: userId,
    name: 'default',
    title: chart.meta.title,
    key: chart.meta.key,
    time_sig: chart.meta.time,
    tempo: chart.meta.tempo,
    bars: chart.bars,
  })
  if (error) throw new Error(`seedChart failed: ${error.message}`)
}

/** Read back a user's chart via service client for post-interaction assertions. */
export async function readChart(userId: string) {
  const rows = await queryRows('chord_charts', { user_id: userId })
  return rows[0] as Record<string, unknown> | undefined
}

/** Read back a user's preferences via service client. */
export async function readPreferences(userId: string) {
  const rows = await queryRows('user_preferences', { user_id: userId })
  return rows[0] as Record<string, unknown> | undefined
}
