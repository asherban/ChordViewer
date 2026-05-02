import { test, expect } from '@playwright/test'

test('unauthenticated user clicking Open App lands on login page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Open App' }).click()
  await expect(page).toHaveURL(/\/auth\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
