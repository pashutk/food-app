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

    // Wait for the save to complete (button becomes re-enabled when API call finishes)
    await page.waitForFunction(() => {
      const btn = document.querySelector('#save-btn') as HTMLButtonElement;
      return btn && !btn.disabled;
    }, { timeout: 10000 });

    // The edit modal calls location.hash = '#library' on success, which renders the library
    // (empty first, then async load() fetches dishes). Wait for the dish card to appear.
    // If save fails, the modal stays open with an error div; poll and check for that.
    let savedSuccessfully = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const cardCount = await page.locator('a[href^="#editor-"]:has-text("E2E Test Pasta Edited")').count();
      if (cardCount > 0) { savedSuccessfully = true; break; }
      // If error div appears, save failed — stop polling
      const errorCount = await page.locator('.text-red-500').count();
      if (errorCount > 0) break;
    }
    if (!savedSuccessfully) {
      // Check if modal is still open (save failed) vs library not loaded yet
      const modalOpen = await page.locator('#name').isVisible().catch(() => false);
      throw new Error(`Save did not produce a visible dish card. Modal open: ${modalOpen}`);
    }

    // Re-open to verify all changes persisted
    await page.locator('a[href^="#editor-"]:has-text("E2E Test Pasta Edited")').click();
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
