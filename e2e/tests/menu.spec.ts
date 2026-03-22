import { test, expect } from '@playwright/test';
import { login } from '../helpers';

test.describe('menu builder', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page);
    await page.goto('/#editor');
    await page.waitForSelector('#name');
    await page.fill('#name', 'E2E Menu Dish');
    await page.click('[data-tag="dinner"]');
    await page.click('#save-btn');
    await expect(page.locator('text=E2E Menu Dish')).toBeVisible();
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/#menu');
    await page.waitForSelector('#date-input');
  });

  test('shows today\'s date by default', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.locator('#date-input')).toHaveValue(today);
  });

  test('adds a dish to a meal slot', async ({ page }) => {
    const dinnerSlot = page.locator('[data-slot="dinner"]');
    await dinnerSlot.locator('.add-dish-select').selectOption({ label: 'E2E Menu Dish' });
    await expect(dinnerSlot.locator('text=E2E Menu Dish')).toBeVisible();
  });

  test('removes a dish from a meal slot', async ({ page }) => {
    const dinnerSlot = page.locator('[data-slot="dinner"]');

    const dishVisible = await dinnerSlot.locator('text=E2E Menu Dish').isVisible().catch(() => false);
    if (!dishVisible) {
      await dinnerSlot.locator('.add-dish-select').selectOption({ label: 'E2E Menu Dish' });
      await expect(dinnerSlot.locator('text=E2E Menu Dish')).toBeVisible();
    }

    await dinnerSlot.locator('.remove-btn').first().click();
    await expect(dinnerSlot.locator('text=E2E Menu Dish')).not.toBeVisible();
  });

  test('navigates to previous and next day', async ({ page }) => {
    const startDate = await page.locator('#date-input').inputValue();

    await page.click('#prev-day');
    await expect(page.locator('#date-input')).not.toHaveValue(startDate);
    const prevDate = await page.locator('#date-input').inputValue();
    expect(prevDate < startDate).toBeTruthy();

    await page.click('#next-day');
    await expect(page.locator('#date-input')).toHaveValue(startDate);
  });
});
