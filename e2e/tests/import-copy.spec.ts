import { test, expect } from '@playwright/test';
import { login } from '../helpers';

test('copy schema button copies JSON template to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  await page.goto('/#library');
  await page.waitForSelector('#search');

  await page.click('#import-btn');
  await expect(page.locator('#copy-schema-btn')).toBeVisible();

  await page.click('#copy-schema-btn');

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('"name"');
  expect(text).toContain('"tags"');
  expect(text).toContain('"ingredients"');
});
