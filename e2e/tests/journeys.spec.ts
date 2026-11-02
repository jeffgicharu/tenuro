import { expect, test } from '@playwright/test';
import { expectAccessible, signIn, watchPage } from './helpers.ts';

test.describe('main journeys', () => {
  test('sign-in page is accessible and lists the three companies', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Tenuro' })).toBeVisible();
    for (const name of ['Mbuyu Court Holdings', 'Sunbula Estates', 'Halvard & Crane Property Partners']) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await expectAccessible(page, 'sign-in');
    expect(problems).toEqual([]);
  });

  test('a manager signs in, uses the register and opens a lease', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager');
    await expect(page.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('row').nth(1)).toBeVisible();
    await expectAccessible(page, 'register');

    await page.getByRole('searchbox', { name: 'Search leases' }).or(page.getByLabel('Search leases')).first().fill('Nairobi');
    await expect(grid.getByRole('row').nth(1)).toContainText(/Nairobi/);

    await grid.getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/leases\/[A-Za-z0-9=%]+$/);
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expectAccessible(page, 'lease page');

    for (const tab of ['Rent schedule', 'Key dates', 'Documents', 'Tasks', 'Activity']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
    await expectAccessible(page, 'lease page, activity tab');
    expect(problems).toEqual([]);
  });

  test('the lease form blocks an incomplete step with a summary', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager');
    await page.goto('/leases/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New lease' })).toBeVisible();
    await expectAccessible(page, 'new lease, parties');
    await page.getByRole('button', { name: /Continue to Property/ }).click();
    await expect(page.getByText(/needs? attention in this section/)).toBeVisible();
    await expectAccessible(page, 'new lease, with errors');
    expect(problems).toEqual([]);
  });

  test('a read-only viewer sees no way to create or amend', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Halvard & Crane Property Partners', 'Read-only viewer');
    await expect(page.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New lease' })).toHaveCount(0);
    await page.getByRole('grid').getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Amend lease' })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('the Gulf company runs right to left in Arabic', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Sunbula Estates', 'Portfolio admin');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', /^ar/);
    await expect(page.getByRole('heading', { level: 1, name: 'عقود الإيجار' })).toBeVisible();
    await expectAccessible(page, 'register in Arabic');
    expect(problems).toEqual([]);
  });

  test('every page answers with the security headers', async ({ request }) => {
    const res = await request.get('/leases');
    const headers = res.headers();
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
    expect(headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });
});
