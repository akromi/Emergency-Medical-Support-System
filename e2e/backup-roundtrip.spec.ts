import { test, expect } from '@playwright/test'

// Full backup round-trip through the UI: export a JSON backup, change the data,
// then restore the file with "Replace all" and confirm the store is rebuilt from
// the backup exactly. Exercises db/backup export + import end-to-end.

test('export a backup, then restore it with Replace to rebuild the store', async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()

  // One casualty, then back it up to disk.
  await page.locator('[data-tour="patient"] input').first().fill('Backup Subject')
  await page.locator('.tb-opt', { hasText: 'Immediate' }).click()
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*1/)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Backup/ }).click(),
  ])
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  // Add a second, different casualty — the store now diverges from the backup.
  await page.getByRole('button', { name: /New casualty/ }).click()
  await expect(page.locator('[data-tour="patient"] input').first()).toHaveValue('')
  await page.locator('[data-tour="patient"] input').first().fill('Decoy Person')
  await page.locator('.tb-opt', { hasText: 'Minor' }).click()
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*2/)

  // Restore the backup with "Replace all": wipe current records, import the file.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Restore/ }).click(),
  ])
  await chooser.setFiles(backupPath!)
  await expect(page.locator('.import-confirm')).toContainText(/Import 1 record/)
  await page.getByRole('button', { name: /Replace all/ }).click()

  // The store is exactly the backup: Subject is back, Decoy is gone.
  await expect(page.getByRole('button', { name: /Board/ })).toHaveText(/·\s*1/)
  await page.getByRole('button', { name: /Board/ }).click()
  await expect(page.locator('.bc-name', { hasText: 'Backup Subject' })).toBeVisible()
  await expect(page.locator('.bc-name', { hasText: 'Decoy Person' })).toHaveCount(0)
})
