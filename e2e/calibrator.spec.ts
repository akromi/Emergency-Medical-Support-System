import { test, expect } from '@playwright/test'

// The region calibrator is admin-gated maintenance furniture (English-only, out
// of the guided tour). This smoke signs in an admin, opens it, and exercises the
// add / shape-switch / split / delete flow so the wiring can't silently rot.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('admin can add, reshape, split and delete a calibrator region', async ({ page }) => {
  page.on('dialog', (d) => d.accept()) // auto-confirm the delete guard

  // Sign in as an admin (no PIN → no step-up prompt).
  await page.getByRole('button', { name: /Operators/ }).click()
  const op = page.locator('.op')
  await op.getByPlaceholder('Operator name').fill('Chief')
  await op.locator('.op-add select').selectOption('admin')
  await op.getByRole('button', { name: 'Add' }).click()
  await op.locator('.op-pick', { hasText: 'Chief' }).click()
  await op.getByRole('button', { name: /Close/ }).click()

  // Open the gated Admin area → Region calibrator.
  await page.getByRole('button', { name: /🛠 Admin/ }).click()
  await page.getByRole('button', { name: /Region calibrator/ }).click()
  const calib = page.locator('.calib')
  await expect(calib).toBeVisible()

  const regionSelect = calib.locator('.calib-bar select').first()
  const before = await regionSelect.locator('option').count()

  // Add a region → it auto-selects, the edit panel appears, a blue move ring shows.
  await calib.getByRole('button', { name: /Add region/ }).click()
  await expect(calib.locator('.calib-edit')).toBeVisible()
  await expect(calib.locator('.calib-edit .ce-name')).toHaveValue('New region')
  await expect(calib.locator('.calib-h.move')).toHaveCount(1)
  await expect(regionSelect.locator('option')).toHaveCount(before + 1)

  // Overlap priority: a region defaults to 0; "To front" raises it (wins overlaps),
  // a "↓" step lowers it back below the default.
  const prio = calib.locator('.calib-edit .cn-lbl', { hasText: 'Priority' })
  await expect(prio).toHaveText('Priority 0')
  await calib.getByRole('button', { name: /Front/ }).click()
  await expect(prio).toHaveText(/Priority [1-9]/)        // raised above everything
  await calib.getByRole('button', { name: 'lower priority' }).click()
  await expect(prio).toHaveText('Priority 0')            // back to default

  // Switch it to a free polygon → green "+" insert handles appear.
  await calib.locator('.calib-shape').selectOption('polygon')
  await expect(calib.locator('.calib-h.add').first()).toBeVisible()

  // Switch to a triangle, then split it into two halves (region count grows by one).
  await calib.locator('.calib-shape').selectOption('triangle')
  await calib.getByRole('button', { name: /Split/ }).click()
  await expect(regionSelect.locator('option')).toHaveCount(before + 2)
  await expect(calib.locator('.calib-edit .ce-name')).toHaveValue(/New region 1/)

  // Delete the selected half → count drops and the selection clears.
  await calib.getByRole('button', { name: /Delete/ }).click()
  await expect(regionSelect.locator('option')).toHaveCount(before + 1)
  await expect(calib.locator('.calib-edit')).toHaveCount(0)
})
