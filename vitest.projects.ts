// Shared list of every Vitest project in the monorepo, so one run / one UI
// covers the whole suite: the app tests (jsdom, ./vitest.config.ts) plus the
// three framework-free packages (node).
export const projects = [
  './packages/core/vitest.config.ts',
  './packages/ehr-gateway/vitest.config.ts',
  './packages/sync-service/vitest.config.ts',
  './vitest.config.ts',
]
