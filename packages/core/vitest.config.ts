import { defineConfig } from 'vitest/config'

// The core package is environment-agnostic; run its tests under Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
