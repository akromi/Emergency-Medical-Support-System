import { test, expect } from '@playwright/test'

// Operator roster: adding/selecting an operator, RBAC-lite gating of the audit
// view, and attribution of the audit actor.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('operators: add, switch, RBAC gating, and attribution', async ({ page }) => {
  const openOperators = () => page.getByRole('button', { name: /Operators/ }).click()

  // With no roster, the Audit log is visible (community default).
  await expect(page.getByRole('button', { name: /Audit log/ })).toBeVisible()

  // Bootstrap (nobody signed in): add a field operator and an admin.
  await openOperators()
  const op = page.locator('.op')
  await op.getByPlaceholder('Operator name').fill('Medic F')
  await op.locator('.op-add select').selectOption('field')
  await op.getByRole('button', { name: 'Add' }).click()
  await expect(op.locator('.op-pick', { hasText: 'Medic F' })).toBeVisible() // wait out the async add
  await op.getByPlaceholder('Operator name').fill('Chief')
  await op.locator('.op-add select').selectOption('admin')
  await op.getByRole('button', { name: 'Add' }).click()
  await expect(op.locator('.op-pick', { hasText: 'Chief' })).toBeVisible()

  // Switch to the FIELD operator → a field role hides the Audit log.
  await op.locator('.op-pick', { hasText: 'Medic F' }).click() // switch (no PIN)
  await op.getByRole('button', { name: /Close/ }).click()
  await expect(page.locator('.op-chip')).toContainText('Medic F')
  await expect(page.getByRole('button', { name: /Audit log/ })).toHaveCount(0)

  // Switch to the ADMIN → the Audit log returns (switching isn't gated).
  await openOperators()
  await op.locator('.op-pick', { hasText: 'Chief' }).click()
  await op.getByRole('button', { name: /Close/ }).click()
  await expect(page.getByRole('button', { name: /Audit log/ })).toBeVisible()

  // Create a casualty → the audit actor is the active operator.
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Audit log/ }).click()
  await expect(page.locator('.audit-tbl', { hasText: 'Chief (admin)' })).toBeVisible()
})
