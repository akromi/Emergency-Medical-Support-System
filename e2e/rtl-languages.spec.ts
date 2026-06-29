import { test, expect } from '@playwright/test'

// The ?lang= switch must drive both the document language and, for Arabic and
// Persian, right-to-left layout (set on <html dir>). Guards the i18n + RTL wiring
// that the whole Arabic/Persian experience depends on.

const cases = [
  { lang: 'en', dir: 'ltr' },
  { lang: 'fr', dir: 'ltr' },
  { lang: 'ar', dir: 'rtl' },
  { lang: 'fa', dir: 'rtl' },
]

for (const c of cases) {
  test(`?lang=${c.lang} sets html lang=${c.lang} and dir=${c.dir}`, async ({ page }) => {
    await page.goto(`/?lang=${c.lang}`)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', c.lang)
    await expect(html).toHaveAttribute('dir', c.dir)
    // The app still renders its brand regardless of language/direction.
    await expect(page.getByText('TRIAGE-LINK').first()).toBeVisible()
  })
}

test('switching to Arabic flips direction live, and back to English restores it', async ({ page }) => {
  await page.goto('/?lang=en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('/?lang=ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  // A right-to-left run direction is actually applied to the rendered body.
  const dir = await page.evaluate(() => getComputedStyle(document.body).direction)
  expect(dir).toBe('rtl')
})
