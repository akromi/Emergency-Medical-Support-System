import { test, expect } from '@playwright/test'

// Durability: a captured record must survive a full page reload (it lives in
// IndexedDB, not memory). Exercises the db/repository persistence layer through
// the real UI rather than a unit harness.

test('a captured casualty survives a page reload', async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()

  await page.locator('[data-tour="patient"] input').first().fill('Persistent Pat')
  await page.locator('.tb-opt', { hasText: 'Delayed' }).click()

  // Wait for the debounced auto-save to land (the Board counter reflects it).
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*1/)

  // Hard reload — the in-memory editor resets, but the store must not.
  await page.reload()
  const dismiss2 = page.locator('.tour-offer .tip-x')
  if (await dismiss2.count()) await dismiss2.first().click()

  // The persisted record is still counted and still on the board after reload.
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*1/)
  await page.getByRole('button', { name: /Board/ }).click()
  await expect(page.locator('.bc-name', { hasText: 'Persistent Pat' })).toBeVisible()
})
