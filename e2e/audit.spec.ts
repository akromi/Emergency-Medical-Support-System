import { test, expect } from '@playwright/test'

// Creating a casualty emits a 'record.create' audit event; the viewer lists it
// and the hash-chain verifies as intact.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('audit log records events and verifies the chain', async ({ page }) => {
  // One saved casualty → a record.create event (wait out the ~400ms autosave).
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: /Audit log/ }).click()
  const panel = page.locator('.audit')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.audit-tbl tbody tr')).not.toHaveCount(0)
  await expect(panel.locator('.audit-tbl', { hasText: 'record.create' })).toBeVisible()

  await panel.getByRole('button', { name: /Verify chain/ }).click()
  await expect(panel.locator('.audit-ok')).toBeVisible()

  await panel.getByRole('button', { name: /Close/ }).click()
  await expect(page.locator('.audit')).toHaveCount(0)
})
