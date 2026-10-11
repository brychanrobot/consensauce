import { defineConfig, devices } from '@playwright/test';

const projectName = 'consensauce';
const baseURL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.PORTLESS_URL ||
  (process.env.LOCAL_DOMAIN
    ? `https://${process.env.LOCAL_DOMAIN}`
    : `https://${projectName}.localhost`);

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    ignoreHTTPSErrors: true,
    timeout: 60 * 1000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
