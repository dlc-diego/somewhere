import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test-build') },
  test: { include: ['src/**/*.test.ts'] },
})
