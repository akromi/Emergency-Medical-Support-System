import { test, expect } from '@playwright/test'

// 1x1 PNG — a stand-in wound photo for the file chooser.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Dismiss the first-run guided-tour offer if it appears.
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('loads the field casualty record', async ({ page }) => {
  await expect(page.getByText('TRIAGE-LINK').first()).toBeVisible()
  await expect(page.getByText('Field Casualty Record')).toBeVisible()
})

test('place an injury, attach a photo, and see it on the casualty card', async ({ page }) => {
  // Pick a type, then drop a marker on the anterior chart (zoom, then place).
  await page.getByRole('button', { name: 'Burn' }).click()
  const chart = page.locator('.charts .bodyview svg').first()
  const box = await chart.boundingBox()
  if (!box) throw new Error('chart not laid out')
  const at = { x: box.width * 0.5, y: box.height * 0.4 }
  await chart.click({ position: at }) // zoom into the region
  await chart.click({ position: at }) // drop the marker

  const injuriesCount = page.locator('.panel-h').filter({ hasText: 'Logged injuries' }).locator('.count')
  await expect(injuriesCount).toHaveText('1')

  // Attach a photo through the file chooser the camera button opens.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Add photo/ }).click(),
  ])
  await chooser.setFiles({ name: 'wound.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page.locator('.photos .thumb img')).toHaveCount(1)

  // The summary shows the AT-MIST block and the logged burn.
  await page.getByRole('button', { name: /Summary/ }).click()
  await expect(page.getByText('AT-MIST handover')).toBeVisible()
  await expect(page.locator('.summary-sheet')).toContainText('Burn')
})

test('GCS calculator fills the vitals field and records a set', async ({ page }) => {
  await page.getByText(/GCS calculator/).click()
  await page.getByLabel('GCS verbal').selectOption('4') // Confused -> total 14
  await expect(page.getByPlaceholder(/3.15/)).toHaveValue('14 (E4 V4 M6)')
  await page.getByRole('button', { name: 'Record vitals' }).click()
  await expect(page.getByText(/GCS 14/)).toBeVisible()
})

test('triage tag sets the level and the board opens', async ({ page }) => {
  await page.locator('.tb-opt', { hasText: 'Immediate' }).click()
  await expect(page.getByText('Immediate (Red)')).toBeVisible()
  await page.getByRole('button', { name: /Board/ }).click()
  await expect(page.locator('.board, .triage-board, [class*="board"]').first()).toBeVisible()
})

test('backup downloads a JSON file of all records', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Backup/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^triage-link-backup-.*\.json$/)
})
