import { test, expect } from '@playwright/test'
import { setupTestUser, seedChart, readChart, readPreferences } from './helpers'

// ── DB → UI ───────────────────────────────────────────────────────────────────

test('seeded chart appears in Transcribe view', async ({ page }) => {
  const { user, cleanup } = await setupTestUser(page)

  try {
    await seedChart(user.id, {
      meta: { title: 'Test Song', key: 'F', time: '4/4', tempo: '100' },
      bars: [['Fmaj7', 'Gm7', null, null], ['Am7', 'Bbmaj7', null, null]],
    })

    await page.goto('/app')
    // Switch to Transcribe mode
    await page.getByRole('button', { name: 'Transcribe' }).click()

    // Title is an input — poll its value until the DB pull populates it
    await expect(page.getByPlaceholder('Untitled')).toHaveValue('Test Song')

    // At least one of the seeded chord names should appear in a bar slot
    await expect(page.getByText('Fmaj7').first()).toBeVisible()
  } finally {
    await cleanup()
  }
})

// ── UI → DB ───────────────────────────────────────────────────────────────────

test('toggling notation preference persists to DB', async ({ page }) => {
  const { user, cleanup } = await setupTestUser(page)

  try {
    await page.goto('/app')
    // Wait for the initial Supabase pull so isSyncedRef.current is true before we interact
    await page.waitForLoadState('networkidle')
    // Default notation is 'regular'. Toggle to Jazz.
    await page.getByRole('button', { name: 'Jazz' }).click()

    // Allow time for the debounced pushNotation call to fire
    await page.waitForTimeout(1500)

    const prefs = await readPreferences(user.id)
    expect(prefs?.notation).toBe('jazz')
  } finally {
    await cleanup()
  }
})

test('editing a chart in Transcribe view persists to DB', async ({ page }) => {
  const { user, cleanup } = await setupTestUser(page)

  try {
    await page.goto('/app')
    // Wait for the initial Supabase pull so isSyncedRef.current is true before we interact
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Transcribe' }).click()

    // The title input should be present; update it
    const titleInput = page.getByPlaceholder('Untitled')
    await titleInput.fill('E2E Updated')
    // Blur to trigger save
    await titleInput.press('Tab')

    // Allow debounced save to fire
    await page.waitForTimeout(1500)

    const row = await readChart(user.id)
    expect(row?.title).toBe('E2E Updated')
  } finally {
    await cleanup()
  }
})
