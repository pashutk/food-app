import { test, expect } from '@playwright/test';
import { login } from '../helpers';

const DISH_NAME = 'E2E Shopping Dish';
const today = new Date().toISOString().slice(0, 10);

test.describe.serial('shopping list', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page);

    // Create dish with two ingredients
    await page.goto('/#editor');
    await page.waitForSelector('#name');
    await page.fill('#name', DISH_NAME);
    await page.click('[data-tag="lunch"]');

    await page.click('#add-ingredient');
    await page.fill('div[data-ing="0"] [data-field="name"]', 'Tomatoes');
    await page.fill('div[data-ing="0"] [data-field="quantity"]', '3');
    await page.fill('div[data-ing="0"] [data-field="unit"]', 'pcs');

    await page.click('#add-ingredient');
    await page.fill('div[data-ing="1"] [data-field="name"]', 'Olive oil');
    await page.fill('div[data-ing="1"] [data-field="quantity"]', '2');
    await page.fill('div[data-ing="1"] [data-field="unit"]', 'tbsp');

    await page.click('#save-btn');
    await expect(page.locator(`text=${DISH_NAME}`)).toBeVisible();

    // Add it to today's lunch slot
    await page.goto('/#menu');
    await page.waitForSelector('#date-input');
    await page.locator('[data-slot="lunch"] .add-dish-select').selectOption({ label: DISH_NAME });
    await expect(page.locator('[data-slot="lunch"]').locator(`text=${DISH_NAME}`)).toBeVisible();

    await page.close();
  });

  test('shows ingredients aggregated from today\'s menu', async ({ page }) => {
    await login(page);
    await page.goto('/#shopping');
    await page.waitForSelector('#date-input');

    await expect(page.locator('#date-input')).toHaveValue(today);
    await expect(page.locator('text=Tomatoes')).toBeVisible();
    await expect(page.locator('text=Olive oil')).toBeVisible();
  });

  test('shows empty state when menu has no non-takeout dishes', async ({ page }) => {
    await login(page);
    await page.goto('/#shopping');
    await page.waitForSelector('#date-input');

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureDate = future.toISOString().slice(0, 10);

    await page.fill('#date-input', futureDate);
    await page.dispatchEvent('#date-input', 'change');

    await expect(
      page.locator('text=No ingredients — menu is empty or all dishes are takeout'),
    ).toBeVisible();
  });
});
