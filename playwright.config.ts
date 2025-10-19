import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  reporter: [['list'], ['html', { open: 'never' }]]
});
