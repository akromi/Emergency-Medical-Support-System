import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// CSV roster: export downloads a .csv with the scalar fields; import creates
// casualty records (reusing the merge/replace confirm flow).
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('export a roster CSV and import one back', async ({ page }) => {
  const board = page.getByRole('button', { name: /Board/ })

  // One saved casualty (triage immediate).
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(600)
  await expect(board).toContainText('· 1')

  // Export → a .csv download containing the row.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ CSV', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/triage-link-roster-.*\.csv/)
  const csv = readFileSync(await download.path(), 'utf8')
  expect(csv).toContain('triage')
  expect(csv).toContain('immediate')

  // Import a roster CSV that adds a casualty → confirm (merge).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '⬆ CSV', exact: true }).click(),
  ])
  await chooser.setFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('id,name,triage\r\nCAS-IMPORTED,Imported Casualty,minor'),
  })
  // exact: the substring "merge" also lives inside "E·merge·nt" response-mode buttons.
  await page.getByRole('button', { name: 'Merge', exact: true }).click()

  // Now two casualties; the imported one shows on the board.
  await expect(board).toContainText('· 2')
  await board.click()
  await expect(page.locator('.board-card', { hasText: 'Imported Casualty' })).toBeVisible()
})
