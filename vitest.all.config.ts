import { defineConfig } from 'vitest/config'
import { projects } from './vitest.projects'

// Aggregates every package + app project into a single Vitest run, so the UI
// (`npm run test:ui`) shows all tests on one page:
//   pass/fail, durations, filtering, error diffs, and the module graph.
export default defineConfig({
  test: { projects },
})
