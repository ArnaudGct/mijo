import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3181',
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-local.mjs',
    url: 'http://127.0.0.1:3181/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
