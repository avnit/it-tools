import { expect, test } from '@playwright/test';

test.describe('Tool - MCP server tester', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mcp-server-tester');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('MCP server tester - IT Tools');
  });

  test('Shows the client-side disclaimer before any call is made', async ({ page }) => {
    await expect(page.getByText('Everything runs in your browser')).toBeVisible();
  });
});
