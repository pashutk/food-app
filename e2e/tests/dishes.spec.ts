import { test, expect } from '@playwright/test';
import { login } from '../helpers';

test.describe.serial('dish CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/#library');
    await page.waitForSelector('#search');
  });

  test('creates a new dish', async ({ page }) => {
    await page.click('a[href="#editor"]');
    await page.waitForSelector('#name');

    await page.fill('#name', 'E2E Test Pasta');
    await page.click('[data-tag="dinner"]');

    await page.click('#add-ingredient');
    await page.fill('div[data-ing="0"] [data-field="name"]', 'Pasta');
    await page.fill('div[data-ing="0"] [data-field="quantity"]', '200');
    await page.fill('div[data-ing="0"] [data-field="unit"]', 'g');

    await page.fill('#instructions', 'Boil pasta for 10 minutes.');
    await page.click('#save-btn');

    await expect(page.locator('text=E2E Test Pasta')).toBeVisible();
  });

  test('edits an existing dish', async ({ page }) => {
    await page.click('text=E2E Test Pasta');
    await page.waitForSelector('#name');

    // Verify initial state loaded from DB
    await expect(page.locator('#name')).toHaveValue('E2E Test Pasta');
    await expect(page.locator('[data-tag="dinner"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tag="lunch"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('div[data-ing="0"] [data-field="name"]')).toHaveValue('Pasta');
    await expect(page.locator('div[data-ing="0"] [data-field="quantity"]')).toHaveValue('200');
    await expect(page.locator('div[data-ing="0"] [data-field="unit"]')).toHaveValue('g');
    await expect(page.locator('#instructions')).toHaveValue('Boil pasta for 10 minutes.');

    // Change name
    await page.fill('#name', 'E2E Test Pasta Edited');

    // Toggle tags: add lunch, remove dinner
    await page.click('[data-tag="lunch"]');
    await page.click('[data-tag="dinner"]');

    // Edit existing ingredient
    await page.fill('div[data-ing="0"] [data-field="name"]', 'Spaghetti');
    await page.fill('div[data-ing="0"] [data-field="quantity"]', '250');
    await page.fill('div[data-ing="0"] [data-field="unit"]', 'g');

    // Add a second ingredient
    await page.click('#add-ingredient');
    await page.fill('div[data-ing="1"] [data-field="name"]', 'Tomato sauce');
    await page.fill('div[data-ing="1"] [data-field="quantity"]', '150');
    await page.fill('div[data-ing="1"] [data-field="unit"]', 'ml');

    // Update instructions and add notes
    await page.fill('#instructions', 'Boil spaghetti 8 min. Add sauce.');
    await page.fill('#notes', 'Can use any pasta shape.');

    await page.click('#save-btn');

    // Wait for modal to close (indicates successful save), then verify dish appears in list
    await page.waitForSelector('#name', { state: 'hidden', timeout: 10000 });
    await expect(page.locator('text=E2E Test Pasta Edited')).toBeVisible({ timeout: 10000 });

    // Re-open to verify all changes persisted
    await page.click('text=E2E Test Pasta Edited');
    await page.waitForSelector('#name');

    await expect(page.locator('#name')).toHaveValue('E2E Test Pasta Edited');
    await expect(page.locator('[data-tag="lunch"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tag="dinner"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('div[data-ing="0"] [data-field="name"]')).toHaveValue('Spaghetti');
    await expect(page.locator('div[data-ing="0"] [data-field="quantity"]')).toHaveValue('250');
    await expect(page.locator('div[data-ing="0"] [data-field="unit"]')).toHaveValue('g');
    await expect(page.locator('div[data-ing="1"] [data-field="name"]')).toHaveValue('Tomato sauce');
    await expect(page.locator('div[data-ing="1"] [data-field="quantity"]')).toHaveValue('150');
    await expect(page.locator('div[data-ing="1"] [data-field="unit"]')).toHaveValue('ml');
    await expect(page.locator('#instructions')).toHaveValue('Boil spaghetti 8 min. Add sauce.');
    await expect(page.locator('#notes')).toHaveValue('Can use any pasta shape.');

    // Remove the second ingredient and verify only one remains
    await page.locator('div[data-ing="1"] .remove-ing').click();
    await expect(page.locator('div[data-ing="1"]')).not.toBeVisible();
    await expect(page.locator('div[data-ing="0"] [data-field="name"]')).toHaveValue('Spaghetti');

    await page.click('#save-btn');
    await expect(page.locator('text=E2E Test Pasta Edited')).toBeVisible();

    // Confirm only one ingredient saved
    await page.click('text=E2E Test Pasta Edited');
    await page.waitForSelector('#name');
    await expect(page.locator('div[data-ing="0"]')).toBeVisible();
    await expect(page.locator('div[data-ing="1"]')).not.toBeVisible();
  });

  test('deletes a dish', async ({ page }) => {
    await page.click('text=E2E Test Pasta Edited');
    await page.waitForSelector('#delete-btn');

    page.once('dialog', dialog => dialog.accept());
    await page.click('#delete-btn');

    await expect(page.locator('text=E2E Test Pasta Edited')).not.toBeVisible();
  });

  test('shows empty state when no dishes match search', async ({ page }) => {
    await page.fill('#search', 'xyznonexistent');
    await expect(page.locator('text=No dishes found')).toBeVisible();
  });
});
