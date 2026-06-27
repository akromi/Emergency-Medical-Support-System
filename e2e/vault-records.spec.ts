import { test, expect } from '@playwright/test'

// Safety property for the full vault: a saved casualty survives being encrypted,
// locked, and unlocked — no data loss across the cycle.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('records survive enable → lock → unlock', async ({ page }) => {
  const PASS = 'field-vault-pass'
  const board = page.getByRole('button', { name: /Board/ })

  // One saved casualty (triage immediate); wait out the ~400ms auto-save.
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(600)
  await expect(board).toContainText('· 1')

  // Encrypt at rest.
  page.once('dialog', (d) => d.accept(PASS))
  await page.getByRole('button', { name: /Encrypt data/ }).click()
  await expect(page.getByRole('button', { name: /Lock now/ })).toBeVisible()
  await expect(board).toContainText('· 1') // still readable while unlocked

  // Lock → the gate appears; unlock with the passphrase.
  await page.getByRole('button', { name: /Lock now/ }).click()
  await expect(page.locator('.vault-lock')).toBeVisible()
  await page.locator('.vault-lock input[type="password"]').fill(PASS)
  await page.locator('.vault-lock').getByRole('button', { name: /Unlock/ }).click()
  await expect(page.locator('.vault-lock')).toHaveCount(0)

  // The casualty is back — no data lost.
  await expect(board).toContainText('· 1')
  await board.click()
  await expect(page.locator('.board-card')).toHaveCount(1)
})
