import { test, expect } from '@playwright/test'

// Humanitarian flavor: the device-wide deployment context bar, the disaster/MCI
// mode that makes encryption mandatory, and the retention-window preset. All
// humanitarian-only UI.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

async function expandDeployment(page: import('@playwright/test').Page) {
  if (!(await page.locator('.deploy-op').isVisible().catch(() => false))) {
    await page.locator('.deploy-show').click()
  }
}

test('deployment context tags the operation as provenance', async ({ page }) => {
  await expect(page.locator('.deploybar')).toBeVisible()
  await expandDeployment(page)
  await page.locator('.deploy-op').fill('Op Cedar')
  await page.locator('.deploy-org').fill('Relief Org')
  await page.locator('.deploy-done').click()
  // The collapsed bar now summarizes the operation it stamps onto records.
  await expect(page.locator('.deploy-summary')).toContainText('Op Cedar')
})

test('MCI mode makes encryption mandatory (forces the vault)', async ({ page }) => {
  // The MCI toggle warns that encryption becomes mandatory — accept it.
  page.on('dialog', (d) => d.accept())
  await expandDeployment(page)
  await page.locator('.deploy-mci input[type="checkbox"]').check()

  // The deployment enters MCI styling…
  await expect(page.locator('.deploybar.mci')).toHaveCount(1)
  // …and the vault is now required: the lock/setup screen is forced on.
  await expect(page.locator('.vault-lock')).toBeVisible()
})

test('a retention preset selects a purge window and persists across reload', async ({ page }) => {
  const sel = page.locator('.retention select')
  await expect(sel).toHaveValue('0') // default: keep all
  await sel.selectOption('30')
  await expect(sel).toHaveValue('30')

  await page.reload()
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
  // The window is localStorage-backed, so it survives a reload.
  await expect(page.locator('.retention select')).toHaveValue('30')
})
