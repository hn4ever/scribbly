import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const demoPath = resolve(__dirname, '../../demo/page/index.html');

test('demo page renders instructional content', async ({ page }) => {
  await page.goto(`file://${demoPath}`);
  await expect(page.getByRole('heading', { name: 'Try Scribbly here' })).toBeVisible();
  await expect(
    page.getByText('Scribbly routes the selection to the on-device Summarizer API', {
      exact: false
    })
  ).toBeVisible();
});
