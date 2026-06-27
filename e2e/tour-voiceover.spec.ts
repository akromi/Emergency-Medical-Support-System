import { test, expect } from '@playwright/test'

// Verifies the guided-tour voice-over speaks each UI language with the correct
// SpeechSynthesis language tag (not the en-US fallback) AND the matching
// narration text. We stub window.speechSynthesis before the app boots so we can
// capture what would be spoken without needing audio output or platform voices.
const CASES = [
  { lang: 'en', tag: 'en-US', sample: 'Welcome to Triage-Link' },
  { lang: 'fr', tag: 'fr-FR', sample: 'Bienvenue' },
  { lang: 'ar', tag: 'ar-SA', sample: 'مرحب' },
  { lang: 'fa', tag: 'fa-IR', sample: 'خوش آمدید' },
]

for (const c of CASES) {
  test(`tour voice-over uses ${c.tag} for ?lang=${c.lang}`, async ({ page }) => {
    // Record every utterance the app hands to speechSynthesis.speak().
    await page.addInitScript(() => {
      ;(window as unknown as { __utt: Array<{ lang: string; text: string }> }).__utt = []
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        get: () => ({
          speak: (u: SpeechSynthesisUtterance) =>
            (window as unknown as { __utt: Array<{ lang: string; text: string }> }).__utt.push({ lang: u.lang, text: u.text }),
          cancel: () => {},
          getVoices: () => [],
        }),
      })
    })

    await page.goto(`/?lang=${c.lang}`)
    // Start the guided tour from the first-run offer; the first step narrates.
    await page.locator('.tour-offer .btn.primary').click()

    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __utt: Array<{ lang: string }> }).__utt.length))
      .toBeGreaterThan(0)

    const first = await page.evaluate(
      () => (window as unknown as { __utt: Array<{ lang: string; text: string }> }).__utt[0],
    )
    expect(first.lang).toBe(c.tag)
    expect(first.text).toContain(c.sample)
  })
}
