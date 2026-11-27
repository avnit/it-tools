import { expect, test } from '@playwright/test';

test.describe('Tool - LLM connector tester', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/llm-connector-tester');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('LLM connector tester - IT Tools');
  });

  test('Warns that the key stays in the browser', async ({ page }) => {
    await expect(page.getByText('Your key never leaves this tab')).toBeVisible();
  });
});
