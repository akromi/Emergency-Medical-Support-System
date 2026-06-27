import { test, expect } from '@playwright/test'

// Guards the production Content-Security-Policy: it must be present and strict,
// and the app must run under it with zero CSP violations (which would surface
// as console/page errors in the browser). Catches regressions like an inline
// script that `script-src 'self'` would block.
test('ships a strict CSP and runs with no violations', async ({ page }) => {
  // A real CSP block is logged as "Refused to …" — not the benign "directive is
  // ignored when delivered via <meta>" warning.
  const violations: string[] = []
  const note = (s: string) => { if (/refused to/i.test(s) && /content security policy/i.test(s)) violations.push(s) }
  page.on('console', (m) => note(m.text()))
  page.on('pageerror', (e) => note(String(e)))

  await page.goto('/')

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp, 'CSP meta tag present').toBeTruthy()
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "script-src 'self'",
  ]) {
    expect(csp).toContain(directive)
  }

  // Exercise a slice of the app (the injury/photo path uses blob:/data: images,
  // and React sets inline styles) so any violation would fire.
  await page.getByRole('button', { name: 'Burn' }).click()
  await expect(page.getByText('TRIAGE-LINK').first()).toBeVisible()
  expect(violations, 'no CSP violations').toEqual([])
})
