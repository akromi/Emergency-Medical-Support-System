import { test, expect } from '@playwright/test'

// Ontario flavor: the in-app NEMSIS / OADS conformance pre-check. Verifies the
// read-only view renders its stats, capture gaps and validator issues, keeps the
// NOT-certification framing front-and-centre, and exports shaped NEMSIS XML
// offline. Ontario-only UI (the Conformance button + NemsisConformance modal).

// Wide viewport so the ⋯-menu Conformance control renders inline.
test.use({ viewport: { width: 1440, height: 900 } })

test('NEMSIS/OADS conformance: stats, gaps, placeholder ruleset, NOT-cert, XML export', async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()

  // Open the ⋯ menu only if it's collapsed (narrow); on a wide viewport the
  // Conformance control is inline.
  const more = page.locator('.more-btn')
  if (await more.isVisible().catch(() => false)) await more.click()
  await page.locator('[data-tour="conformance"]').click()

  await expect(page.locator('.summary-overlay')).toBeVisible()
  await expect(page.locator('.sm-brand')).toContainText('NEMSIS / OADS conformance')

  // The NOT-certification disclaimer is prominent and unambiguous.
  await expect(page.locator('.nemsis-disclaimer')).toContainText(/NOT certification/i)

  // Stats render; a sparse record has capture gaps, enumerated below.
  await expect(page.locator('.nemsis-stat')).toHaveCount(4) // sections, errors, warnings, gaps
  await expect(page.locator('.nemsis-stat.gap b')).toHaveText(/\d+/)
  expect(await page.locator('.nemsis-gap').count()).toBeGreaterThan(0)
  await expect(page.locator('.nemsis-gap').first()).toContainText(/e[A-Z]/) // e.g. eTimes / eResponse

  // Validator runs against the clearly-labelled placeholder ruleset.
  await expect(page.locator('.nemsis-ruleset')).toContainText(/placeholder/i)

  // Export shaped NEMSIS XML offline (no network).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export shaped XML/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/-nemsis\.xml$/)

  // Close returns to the record.
  await page.getByRole('button', { name: /Close/ }).click()
  await expect(page.locator('.summary-overlay')).toHaveCount(0)
})
