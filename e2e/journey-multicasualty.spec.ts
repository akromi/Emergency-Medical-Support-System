import { test, expect } from '@playwright/test'

// A full multi-casualty journey: capture two casualties with different triage,
// hand one over, export a FHIR bundle, and confirm the Triage Board reflects the
// whole scene (grouping, search, handed-over badge). Complements happy-path.spec,
// which exercises a single record.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

const name = (page: import('@playwright/test').Page) =>
  page.locator('[data-tour="patient"] input').first()

test('two casualties, a handover, a FHIR export, and the scene on the board', async ({ page }) => {
  // --- Casualty 1: Alpha, Immediate ---
  await name(page).fill('Alpha One')
  await page.locator('.tb-opt', { hasText: 'Immediate' }).click()
  await expect(page.getByText('Immediate (Red)').first()).toBeVisible()
  // Let the first record's debounced save commit before starting a new one.
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*1/)

  // --- New record → Casualty 2: Bravo, Minor (the first stays saved) ---
  await page.getByRole('button', { name: /New casualty/ }).click()
  await expect(name(page)).toHaveValue('') // wait for the fresh record to render
  await name(page).fill('Bravo Two')
  await page.locator('.tb-opt', { hasText: 'Minor' }).click()

  // Both are persisted: the Board button counts saved records.
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*2/)

  // --- Hand Bravo over to a receiving clinician + facility ---
  const ho = page.locator('[data-tour="handover"]')
  await ho.scrollIntoViewIfNeeded()
  await ho.locator('input').first().fill('Dr. Reed')
  await ho.locator('input').nth(1).fill('County General')
  await page.getByRole('button', { name: /Mark handed over/ }).click()
  await expect(page.locator('.ho-badge')).toContainText('Handed over')

  // --- Export the FHIR bundle for the handed-over record ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export FHIR/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/-fhir-bundle\.json$/)

  // --- The Board shows both casualties; Bravo is flagged handed-over ---
  await page.getByRole('button', { name: /Board/ }).click()
  await expect(page.locator('.bc-name', { hasText: 'Alpha One' })).toBeVisible()
  await expect(page.locator('.bc-name', { hasText: 'Bravo Two' })).toBeVisible()
  await expect(page.locator('.bc-ho').first()).toBeVisible() // handed-over badge

  // Search narrows the board to a single casualty.
  await page.locator('.board-search input').fill('Alpha')
  await expect(page.locator('.bc-name', { hasText: 'Alpha One' })).toBeVisible()
  await expect(page.locator('.bc-name', { hasText: 'Bravo Two' })).toHaveCount(0)
})
