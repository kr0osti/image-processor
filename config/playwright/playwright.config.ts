import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Resolved relative to this file
  testDir: '../../e2e',
  fullyParallel: true,
  // Fail the build on CI if test.only was left in the source code
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  // Inline annotations on CI, plus an HTML report uploaded as an artifact
  // Paths below are relative to this file, so point them back at the repo root
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]]
    : [['html', { outputFolder: '../../playwright-report' }]],
  outputDir: '../../test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // CI runs Chromium only; locally all three engines run
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(isCI ? [] : [
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ]),
  ],

  // Skipped when PLAYWRIGHT_BASE_URL points at an already running server.
  // CI tests the production build (`pnpm build` runs first); locally the dev server.
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: isCI ? 'pnpm start' : 'pnpm dev',
    cwd: '../..',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
