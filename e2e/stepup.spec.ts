import { test, expect, type Page } from '@playwright/test'

// Step-up re-auth: once an on-duty operator has a PIN, sensitive actions (here,
// opening the audit log) re-prompt for it. With an empty roster nothing prompts
// (covered by the other specs, which run unaffected).
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

// Answer the masked PIN dialog (replaces the old clear-text window.prompt).
async function answerPin(page: Page, pin: string) {
  const box = page.locator('.secret-box')
  await expect(box).toBeVisible()
  await expect(box.locator('input')).toHaveAttribute('type', 'password') // masked by default
  await box.locator('input').fill(pin)
  await box.getByRole('button', { name: 'Continue' }).click()
  await expect(box).toHaveCount(0)
}

test('protected actions re-prompt for the on-duty operator PIN', async ({ page }) => {
  // Add an admin operator WITH a PIN (roster empty → adding is not gated yet).
  await page.getByRole('button', { name: /Operators/ }).click()
  await page.getByPlaceholder('Operator name').fill('Admin')
  await page.locator('.op-add select').selectOption('admin')
  await page.getByPlaceholder('PIN (optional)').fill('1234')
  await page.locator('.op-add').getByRole('button', { name: 'Add', exact: true }).click()

  // Sign in — switching to a PIN-protected operator asks for the PIN (masked).
  const adminRow = page.locator('.op-pick', { hasText: 'Admin' })
  await expect(adminRow).toBeVisible()
  await adminRow.click()
  await answerPin(page, '1234')
  await expect(page.locator('.op-active')).toBeVisible()
  await page.locator('.op').getByRole('button', { name: /Close/ }).click()

  // Open the audit log → step-up prompt → correct PIN opens it.
  await page.getByRole('button', { name: /Audit log/ }).click()
  await answerPin(page, '1234')
  await expect(page.locator('.audit')).toBeVisible()
  await page.locator('.audit').getByRole('button', { name: /Close/ }).click()
  await expect(page.locator('.audit')).toHaveCount(0)

  // Wrong PIN → action denied, panel stays closed.
  await page.getByRole('button', { name: /Audit log/ }).click()
  await answerPin(page, '9999')
  await expect(page.locator('.backup-msg')).toContainText('Incorrect PIN')
  await expect(page.locator('.audit')).toHaveCount(0)

  // The masked field can be revealed with Show, then re-hidden with Hide.
  await page.getByRole('button', { name: /Audit log/ }).click()
  const box = page.locator('.secret-box')
  await expect(box).toBeVisible()
  await box.getByRole('button', { name: 'Show' }).click()
  await expect(box.locator('input')).toHaveAttribute('type', 'text')
  await box.getByRole('button', { name: 'Hide' }).click()
  await expect(box.locator('input')).toHaveAttribute('type', 'password')
  await box.getByRole('button', { name: 'Cancel' }).click()
  await expect(box).toHaveCount(0)
  await expect(page.locator('.audit')).toHaveCount(0)
})
