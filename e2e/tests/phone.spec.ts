import { expect, test } from '@playwright/test';
import { expectAccessible, signIn, watchPage } from './helpers.ts';

test('on a phone the register is a card list and the page never scrolls sideways', async ({ page }) => {
  const problems = watchPage(page);
  await signIn(page, 'Mbuyu Court Holdings', 'Lease manager');
  await expect(page.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
  await expect(page.getByRole('grid')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
  await expectAccessible(page, 'register on a phone');
  expect(problems).toEqual([]);
});
