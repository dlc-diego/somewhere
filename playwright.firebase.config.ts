import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '**/account-cloud.spec.ts',
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4175',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'VITE_FIREBASE_EMULATORS=true npm run dev -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
})
