import { test, expect } from '@playwright/test'

// Guards the guided-tour structure: the full step list (incl. the patient and
// handover steps) and that each step renders a localized title + narration.
test('guided tour walks the extended step list with instructions', async ({ page }) => {
  await page.goto('/')
  await page.locator('.tour-offer .btn.primary').click() // Start tour

  const card = page.locator('.tour-card')
  await expect(card).toBeVisible()

  // 15 steps: welcome, patient, palette, charts, editor, triage, vitals,
  // handover, summary, board, operators, vault, backup, langpack, done.
  await expect(card.locator('.tour-step')).toHaveText('1 / 15')
  await expect(card.locator('.tour-title')).toHaveText('Welcome')

  // Next reaches the new "patient" step, which tells the user what to enter.
  await card.getByRole('button', { name: 'Next' }).click()
  await expect(card.locator('.tour-title')).toHaveText('Who is the patient?')
  await expect(card.locator('.tour-say')).toContainText('type the patient’s full name')

  // The interactive "mark it on the body" step spells out the action + auto-advance.
  await card.getByRole('button', { name: 'Next' }).click() // palette
  await card.getByRole('button', { name: 'Next' }).click() // charts
  await expect(card.locator('.tour-title')).toHaveText('Mark it on the body')
  await expect(card.locator('.tour-say')).toContainText('moves on automatically')
})
