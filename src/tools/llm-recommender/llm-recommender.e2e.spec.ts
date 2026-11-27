import { expect, test } from '@playwright/test';

test.describe('Tool - LLM recommender', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/llm-recommender');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('LLM recommender - IT Tools');
  });

  test('Ranks a best match with the default selection', async ({ page }) => {
    await expect(page.getByText('Best match')).toBeVisible();
  });
});
