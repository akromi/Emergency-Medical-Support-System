import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// App-level tests run under jsdom with a fake IndexedDB (see test/setup.ts), so
// the real React UI and Dexie repository exercise end-to-end without a browser.
// A separate config from vite.config.ts keeps the PWA/build plugins out of tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
