import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'web/tests/browser',
  use: { browserName: 'chromium', viewport: { width: 1000, height: 700 }, serviceWorkers: 'block' },
  reporter: 'list',
  outputDir: 'target/browser-tests',
});
