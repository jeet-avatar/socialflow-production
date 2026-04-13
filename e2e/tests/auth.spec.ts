import { test, expect } from '@playwright/test';

test.describe('Auth flow', () => {
  test('unauthenticated user sees login prompt on dashboard', async ({ page }) => {
    // Navigate directly to a protected route
    await page.goto('/dashboard');
    // Should either redirect to landing or show a login/sign-in element
    const url = page.url();
    const hasLoginElement = await page.getByRole('button', { name: /sign in|log in|get started/i }).count() > 0;
    const redirectedToRoot = url.endsWith('/') || url.includes('/#');
    expect(hasLoginElement || redirectedToRoot).toBeTruthy();
  });

  test('landing page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Filter out known non-critical warnings (e.g. Stripe load warnings)
    const criticalErrors = errors.filter(
      (e) => !e.includes('Stripe') && !e.includes('favicon'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
