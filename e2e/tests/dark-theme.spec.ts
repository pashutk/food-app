import { test, expect } from '@playwright/test';

test('uses dark background when prefers-color-scheme is dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const bg = await page.locator('.min-h-screen').first().evaluate(el =>
    getComputedStyle(el).backgroundColor
  );
  const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  expect(match).toBeTruthy();
  const sum = parseInt(match![1]) + parseInt(match![2]) + parseInt(match![3]);
  expect(sum).toBeLessThan(100); // dark:bg-gray-950 is near-black
});

test('uses light background when prefers-color-scheme is light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const bg = await page.locator('.min-h-screen').first().evaluate(el =>
    getComputedStyle(el).backgroundColor
  );
  const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  expect(match).toBeTruthy();
  const sum = parseInt(match![1]) + parseInt(match![2]) + parseInt(match![3]);
  expect(sum).toBeGreaterThan(700); // bg-gray-50 is near-white
});

test('header has dark background in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const bg = await page.locator('header').evaluate(el =>
    getComputedStyle(el).backgroundColor
  );
  const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  expect(match).toBeTruthy();
  const sum = parseInt(match![1]) + parseInt(match![2]) + parseInt(match![3]);
  expect(sum).toBeLessThan(150); // dark:bg-gray-900
});

test('login form has dark background in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await expect(page.locator('#login-form')).toBeVisible();
  const bg = await page.locator('#login-form').locator('..').evaluate(el =>
    getComputedStyle(el).backgroundColor
  );
  const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  expect(match).toBeTruthy();
  const sum = parseInt(match![1]) + parseInt(match![2]) + parseInt(match![3]);
  expect(sum).toBeLessThan(200); // dark:bg-gray-900
});
