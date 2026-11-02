import { defineConfig, devices } from '@playwright/test';

// Runs against a production build served by the release's own server (see the CI release job).
export default defineConfig({
  testDir: '.',
  timeout: 45_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:9000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
