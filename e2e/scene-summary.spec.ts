import { test, expect } from '@playwright/test'

// Seeds two triaged casualties and opens the incident-command summary from the
// board, asserting the tally + roster render. (Auto-save is debounced ~400ms,
// so wait between casualties before starting a new one.)
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('command summary rolls up the scene', async ({ page }) => {
  // Casualty 1 — immediate.
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(550)
  await page.getByRole('button', { name: 'New' }).first().click()
  // Casualty 2 — delayed.
  await page.locator('.triagebar .tb-opt').nth(1).click()
  await page.waitForTimeout(550)

  await page.getByRole('button', { name: /Board/ }).click()
  await page.getByRole('button', { name: /Command summary/ }).click()

  const sheet = page.locator('.summary-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Scene summary')).toBeVisible()
  // Tally tiles render; the roster lists both casualties.
  await expect(sheet.locator('.scene-tile')).toHaveCount(5)
  await expect(sheet.locator('.scene-tbl tbody tr')).toHaveCount(2)
  await expect(sheet.locator('.scene-pill', { hasText: 'Immediate' })).toHaveCount(1)

  await page.locator('.summary-actions').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.summary-sheet')).toHaveCount(0)
})
