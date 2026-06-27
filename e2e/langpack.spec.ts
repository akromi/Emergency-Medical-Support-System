import { test, expect } from '@playwright/test'

// Load a runtime language pack from a file: the app switches to it, applies RTL,
// shows the pack's strings, and falls back to English for missing keys.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('a runtime language pack loads, switches, and falls back', async ({ page }) => {
  const pack = {
    code: 'xx', name: 'Test Lang', rtl: true,
    strings: { 'app.sub': 'PACKED SUBTITLE', 'hdr.new': 'PACKED NEW' }, // partial — rest falls back
  }

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Language pack/ }).click(),
  ])
  await chooser.setFiles({ name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })

  // Switched to the pack: its strings render…
  await expect(page.locator('.brand .sub')).toHaveText('PACKED SUBTITLE')
  await expect(page.getByRole('button', { name: 'PACKED NEW' })).toBeVisible()
  // …a key the pack omits falls back to English…
  await expect(page.getByRole('button', { name: /Board/ })).toBeVisible()
  // …and the declared RTL flag drives the document direction.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
})
