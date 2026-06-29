import { test, expect } from '@playwright/test'

// The tour was extended to teach the "power" features (operators, vault, backup,
// language packs). This walks to those steps and asserts each one renders its
// localized title AND lands its spotlight on a real control (a non-zero
// highlight box, not the centered no-target fallback). Complements
// tour-steps.spec, which checks the early capture steps.

// A wide viewport so the ⋯-menu controls render inline (where the spotlight lands).
test.use({ viewport: { width: 1440, height: 900 } })

test('the tour spotlights operators, vault, backup, and language packs', async ({ page }) => {
  await page.goto('/')
  await page.locator('.tour-offer .btn.primary').click() // Start tour
  const card = page.locator('.tour-card')
  await expect(card).toBeVisible()

  // Steps 1→11: advance to the first power-feature step (Operators).
  for (let i = 0; i < 10; i++) await card.getByRole('button', { name: 'Next' }).click()

  const steps = [
    'Who’s on duty',          // operators
    'Encrypt everything at rest',  // vault
    'Back up and restore',         // backup
    'Add a language',              // langpack
  ]

  for (let s = 0; s < steps.length; s++) {
    await expect(card.locator('.tour-title')).toHaveText(steps[s])
    // The spotlight resolved to a real element (non-zero box).
    const box = await page.locator('.tour-spot').boundingBox()
    expect(box, `spotlight missing on "${steps[s]}"`).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
    if (s < steps.length - 1) await card.getByRole('button', { name: 'Next' }).click()
  }
})
