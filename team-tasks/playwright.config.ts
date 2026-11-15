import { defineConfig } from '@playwright/test';

// Runs against local dev by default. For the live site: E2E_BASE_URL, E2E_ELIJAH and E2E_NEVAN (invite links).
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:8787', trace: 'off' },
  projects: [
    { name: 'phone-390x844', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: 'desktop-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
