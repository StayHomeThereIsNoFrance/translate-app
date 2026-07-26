import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm e2e:serve',
    url: 'http://127.0.0.1:3000/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
