import { defineConfig, devices } from '@playwright/test'

// Browser-level E2E. The webServer builds the PWA and serves the production
// preview, so tests run against the real bundle (service worker, offline store,
// the works). Runs in CI via .github/workflows/e2e.yml (Chromium installed
// there); locally: `npx playwright install chromium` then `npm run test:e2e`.
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
