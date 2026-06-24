import { defineConfig } from 'vitest/config'
import { projects } from './vitest.projects'

// Same aggregate suite, emitting a static HTML report (@vitest/ui) to ./html
// alongside the console output. CI runs this and uploads ./html as the
// "test-report" artifact — a browsable pass/fail snapshot of the whole suite.
export default defineConfig({
  test: {
    projects,
    reporters: ['default', 'html'],
  },
})
