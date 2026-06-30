import { test, expect, type Page } from '@playwright/test'

// Admin-access recovery ladder: a one-time recovery code (tier 2) and the
// last-resort local reset (tier 3). Tier 1 (peer reset) is the normal
// Set/Change PIN button, covered by the operators spec.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const dismiss = page.locator('.tour-offer .tip-x')
  if (await dismiss.count()) await dismiss.first().click()
})

async function addAdminWithPin(page: Page): Promise<string> {
  await page.getByRole('button', { name: /Operators/ }).click()
  const op = page.locator('.op')
  await op.getByPlaceholder('Operator name').fill('Chief')
  await op.locator('.op-add select').selectOption('admin')
  await op.getByPlaceholder('PIN (optional)').fill('1234')
  await op.locator('.op-add').getByRole('button', { name: 'Add', exact: true }).click()
  // A one-time recovery code banner appears — capture it, then dismiss.
  const banner = op.locator('.op-reccode')
  await expect(banner).toBeVisible()
  const code = (await banner.locator('code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  await banner.getByRole('button', { name: /saved/i }).click()
  await expect(banner).toHaveCount(0)
  return code
}

test('a forgotten admin PIN is recovered with the one-time code', async ({ page }) => {
  const code = await addAdminWithPin(page)
  const op = page.locator('.op')
  await expect(op.locator('.op-pick', { hasText: 'Chief' })).toContainText('🔑') // PIN-protected

  await op.getByRole('button', { name: 'Recover access' }).click()
  await op.locator('#rec-code').fill(code)
  await op.getByRole('button', { name: 'Restore admin access' }).click()
  await expect(op.locator('.op-msg')).toContainText('admin PINs cleared')

  // PIN is gone — Chief signs in with no prompt (no masked dialog appears).
  await expect(op.locator('.op-pick', { hasText: 'Chief' })).not.toContainText('🔑')
  await op.locator('.op-pick', { hasText: 'Chief' }).click()
  await expect(op.locator('.op-active')).toBeVisible()
  await expect(page.locator('.secret-box')).toHaveCount(0)
})

test('a wrong recovery code is rejected', async ({ page }) => {
  await addAdminWithPin(page)
  const op = page.locator('.op')
  await op.getByRole('button', { name: 'Recover access' }).click()
  await op.locator('#rec-code').fill('WRON-GWRO-NGWR')
  await op.getByRole('button', { name: 'Restore admin access' }).click()
  await expect(op.locator('.op-msg')).toContainText('not recognized')
  await op.getByRole('button', { name: 'Back' }).click()
  await expect(op.locator('.op-pick', { hasText: 'Chief' })).toContainText('🔑') // still protected
})

test('last-resort local reset clears sign-ins but keeps casualty records', async ({ page }) => {
  // Capture a casualty so we can prove records survive the reset.
  await page.locator('.triagebar .tb-opt').nth(0).click()
  await page.waitForTimeout(400)

  await addAdminWithPin(page)
  const op = page.locator('.op')
  await op.getByRole('button', { name: 'Recover access' }).click()

  // The Clear button is inert until the exact phrase is typed.
  const clearBtn = op.getByRole('button', { name: 'Clear all sign-ins' })
  await expect(clearBtn).toBeDisabled()
  await op.locator('.op-danger input').fill('RESET')
  await expect(clearBtn).toBeEnabled()
  await clearBtn.click()

  await expect(op.locator('.op-msg')).toContainText('casualty records were kept', { ignoreCase: true })
  await expect(op.locator('.op-pick')).toHaveCount(0) // roster emptied
  await op.getByRole('button', { name: /Close/ }).click()

  // The casualty record is still there (the board/summary still works).
  await expect(page.locator('.casualty, .pcr, main')).toBeVisible()
})
