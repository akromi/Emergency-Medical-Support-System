import { test, expect } from '@playwright/test'

// End-to-end of the opt-in photo vault: enabling it (passphrase prompt),
// locking, the lock-screen gate, a wrong passphrase, and a correct unlock.
// The crypto/storage round-trip is covered by unit tests; this guards the React
// lock-screen wiring in a real browser.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('enable the photo vault, lock, and unlock', async ({ page }) => {
  const PASS = 'field-medic-secret'

  // Enabling pops a window.prompt for the passphrase — accept it with our value.
  page.once('dialog', (d) => d.accept(PASS))
  await page.getByRole('button', { name: /Encrypt data/ }).click()

  // The menu flips to the unlocked-state actions.
  const lockNow = page.getByRole('button', { name: /Lock now/ })
  await expect(lockNow).toBeVisible()

  // Lock → the full-screen gate appears and blocks the app.
  await lockNow.click()
  const lock = page.locator('.vault-lock')
  await expect(lock).toBeVisible()

  // Wrong passphrase keeps the gate up.
  await lock.locator('input[type="password"]').fill('not-the-passphrase')
  await lock.getByRole('button', { name: /Unlock/ }).click()
  await expect(lock.locator('.vault-lock-err')).toBeVisible()
  await expect(lock).toBeVisible()

  // Correct passphrase dismisses it.
  await lock.locator('input[type="password"]').fill(PASS)
  await lock.getByRole('button', { name: /Unlock/ }).click()
  await expect(page.locator('.vault-lock')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Lock now/ })).toBeVisible()
})
