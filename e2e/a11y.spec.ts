import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility gate: scan the key screens with axe-core and fail on any
// serious/critical WCAG 2.1 A/AA violation. Field use (gloves, sunlight, stress)
// and procurement both demand this.

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function scan(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(STANDARD).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const summary = bad.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target?.join(' ')}`)
  expect(bad, `${label} a11y violations:\n${summary.join('\n')}`).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('capture screen has no serious a11y violations', async ({ page }) => {
  await scan(page, 'capture (empty)')

  // …and with content: a triage level, an active injury tool, and vitals with a
  // trend — exercising the triage bar, palette, vitals list and sparklines.
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.getByPlaceholder('bpm').fill('120')
  await page.getByRole('button', { name: 'Record vitals' }).click()
  await page.getByPlaceholder('bpm').fill('96')
  await page.getByRole('button', { name: 'Record vitals' }).click()
  await scan(page, 'capture (with content)')
})

test('board, summary, operators and audit overlays are accessible', async ({ page }) => {
  await page.getByRole('button', { name: /Board/ }).click()
  await scan(page, 'board')
  await page.locator('.board-overlay').click({ position: { x: 5, y: 5 } }) // close

  await page.getByRole('button', { name: /Summary/ }).click()
  await scan(page, 'summary')
  await page.locator('.summary-actions').getByRole('button', { name: /Close/ }).click()

  await page.getByRole('button', { name: /Operators/ }).click()
  await scan(page, 'operators')
  await page.locator('.op').getByRole('button', { name: /Close/ }).click()

  await page.getByRole('button', { name: /Audit log/ }).click()
  await scan(page, 'audit')
})
