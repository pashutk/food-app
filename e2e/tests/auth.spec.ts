import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_PASS } from '../helpers';

test('shows login page when not authenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Food & Menu Manager');
  await expect(page.locator('#login-form')).toBeVisible();
});

test('shows error on wrong credentials', async ({ page }) => {
  await page.goto('/');
  await page.fill('#username', 'wrong');
  await page.fill('#password', 'wrong');
  await page.click('button[type="submit"]');
  await expect(page.locator('#login-error')).toBeVisible();
  await expect(page.locator('#login-error')).not.toHaveClass(/hidden/);
});

test('logs in successfully and shows the app', async ({ page }) => {
  await page.goto('/');
  await page.fill('#username', TEST_USER);
  await page.fill('#password', TEST_PASS);
  await page.click('button[type="submit"]');
  await expect(page.locator('#logout-btn')).toBeVisible();
  await expect(page.locator('nav')).toBeVisible();
});

test('logs out and returns to login', async ({ page }) => {
  await page.goto('/');
  await page.fill('#username', TEST_USER);
  await page.fill('#password', TEST_PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#logout-btn');
  await page.click('#logout-btn');
  await expect(page.locator('#login-form')).toBeVisible();
});
