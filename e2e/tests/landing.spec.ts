import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows all three pricing tiers', async ({ page }) => {
    await expect(page.getByText('Starter')).toBeVisible();
    await expect(page.getByText('Creator')).toBeVisible();
    await expect(page.getByText('Agency')).toBeVisible();
  });

  test('pricing tiers show correct prices', async ({ page }) => {
    await expect(page.getByText('$29')).toBeVisible();
    await expect(page.getByText('$79')).toBeVisible();
    await expect(page.getByText('$199')).toBeVisible();
  });

  test('does not display removed $49 price anywhere', async ({ page }) => {
    await expect(page.getByText('$49')).not.toBeVisible();
  });

  test('Get Started CTA is visible', async ({ page }) => {
    // At least one "Get Started" button should be present
    await expect(page.getByRole('button', { name: /get started/i }).first()).toBeVisible();
  });
});
