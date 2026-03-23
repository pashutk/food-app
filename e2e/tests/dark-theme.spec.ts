import { test, expect } from '@playwright/test';
import { login } from '../helpers';

async function getBgRgb(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).first().evaluate(el => {
    const color = getComputedStyle(el).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  });
}

test('uses dark background when prefers-color-scheme is dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.waitForSelector('#login-form');

  const { r, g, b } = await getBgRgb(page, '.min-h-screen');
  expect(r + g + b).toBeLessThan(100); // dark:bg-gray-950 is near-black
});

test('uses light background when prefers-color-scheme is light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.waitForSelector('#login-form');

  const { r, g, b } = await getBgRgb(page, '.min-h-screen');
  expect(r + g + b).toBeGreaterThan(700); // bg-gray-50 is near-white
});

test('header has dark background in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await login(page);

  const { r, g, b } = await getBgRgb(page, 'header');
  expect(r + g + b).toBeLessThan(150); // dark:bg-gray-900
});

test('login form card has dark background in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.waitForSelector('#login-form');

  const { r, g, b } = await page.locator('#login-form').locator('..').evaluate(el => {
    const color = getComputedStyle(el).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  });
  expect(r + g + b).toBeLessThan(200); // dark:bg-gray-900
});
