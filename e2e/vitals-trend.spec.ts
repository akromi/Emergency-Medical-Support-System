import { test, expect } from '@playwright/test'

// Records two timestamped vitals sets and asserts the trend sparklines appear.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('vitals trend sparklines appear after two readings', async ({ page }) => {
  const hr = page.getByPlaceholder('bpm')
  const spo2 = page.getByPlaceholder('%').first()
  const record = page.getByRole('button', { name: 'Record vitals' })

  await hr.fill('120'); await spo2.fill('98'); await record.click()
  // No trend yet with a single reading.
  await expect(page.locator('.vtrend .spark')).toHaveCount(0)

  await hr.fill('96'); await spo2.fill('92'); await record.click()

  // Two readings → sparklines for HR and SpO2 render in the panel.
  const sparks = page.locator('.vtrend-block .spark')
  await expect(sparks).toHaveCount(2)
  await expect(page.locator('.vtrend-block .vtrend-k').first()).toBeVisible()
})
