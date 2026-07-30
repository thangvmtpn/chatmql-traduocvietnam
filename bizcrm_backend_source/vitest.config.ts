import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Unit/service tests mock the HTTP + DB boundaries; no global setup needed.
    coverage: {
      provider: 'v8',
      include: ['src/modules/integrations/**', 'src/shared/domain-events.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
})
