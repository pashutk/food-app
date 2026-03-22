import type { Page } from '@playwright/test';

export const TEST_USER = process.env.E2E_USERNAME ?? 'testuser';
export const TEST_PASS = process.env.E2E_PASSWORD ?? 'testpass';

export async function login(page: Page) {
  await page.goto('/');
  await page.fill('#username', TEST_USER);
  await page.fill('#password', TEST_PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#logout-btn');
}
