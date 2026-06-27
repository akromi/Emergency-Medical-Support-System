import { test, expect } from '@playwright/test'

// Step-up re-auth: once an on-duty operator has a PIN, sensitive actions (here,
// opening the audit log) re-prompt for it. With an empty roster nothing prompts
// (covered by the other specs, which run unaffected).
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

test('protected actions re-prompt for the on-duty operator PIN', async ({ page }) => {
  let pin = '1234'
  page.on('dialog', (d) => d.accept(pin)) // answer every PIN prompt

  // Add an admin operator WITH a PIN (roster empty → adding is not gated yet).
  await page.getByRole('button', { name: /Operators/ }).click()
  await page.getByPlaceholder('Operator name').fill('Admin')
  await page.locator('.op-add select').selectOption('admin')
  await page.getByPlaceholder('PIN (optional)').fill('1234')
  await page.locator('.op-add').getByRole('button', { name: 'Add', exact: true }).click()

  // Sign in — switching to a PIN-protected operator asks for the PIN.
  const adminRow = page.locator('.op-pick', { hasText: 'Admin' })
  await expect(adminRow).toBeVisible()
  await adminRow.click()
  await expect(page.locator('.op-active')).toBeVisible()
  await page.locator('.op').getByRole('button', { name: /Close/ }).click()

  // Open the audit log → step-up prompt → correct PIN opens it.
  await page.getByRole('button', { name: /Audit log/ }).click()
  await expect(page.locator('.audit')).toBeVisible()
  await page.locator('.audit').getByRole('button', { name: /Close/ }).click()
  await expect(page.locator('.audit')).toHaveCount(0)

  // Wrong PIN → action denied, panel stays closed.
  pin = '9999'
  await page.getByRole('button', { name: /Audit log/ }).click()
  await expect(page.locator('.backup-msg')).toContainText('Incorrect PIN')
  await expect(page.locator('.audit')).toHaveCount(0)
})
