import { defineConfig, devices } from '@playwright/test';

// Runs against a production build of Tenuro booted in CI (see .github/workflows/ci.yml), or any
// URL given in E2E_BASE_URL. Never against a developer laptop.
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:9000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /phone\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /phone\.spec\.ts/ },
  ],
});
