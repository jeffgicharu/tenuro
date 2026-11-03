import { expect, test } from '@playwright/test';
import { expectAccessible, signIn, watchPage } from './helpers.ts';

test('on a phone the register is a card list and the page never scrolls sideways', async ({ page }) => {
  const problems = watchPage(page);
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await signIn(page, 'Mbuyu Court Holdings', 'Lease manager');
  await expect(page.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
  await expect(page.getByRole('grid')).toHaveCount(0);
  // The card list starts short (more on request) and the data grid's code is never downloaded.
  const cards = page.getByRole('list', { name: 'Lease register' }).getByRole('listitem');
  await expect(cards).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
  expect(scripts.filter((u) => /RegisterTable-/.test(u))).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
  await expectAccessible(page, 'register on a phone');
  expect(problems).toEqual([]);
});

// Regression: visually hidden labels used `width: 1`, which MUI reads as 100%, so each expiry bar's
// label stretched the overview 319 px past a phone's edge.
test('on a phone the portfolio overview never scrolls sideways', async ({ page }) => {
  const problems = watchPage(page);
  await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', null);
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Critical dates' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
  await expectAccessible(page, 'overview on a phone');
  expect(problems).toEqual([]);
});

// Regression: the balances chart sized itself from its aspect ratio and pushed the accounting tab
// about 230 px past a phone's edge; the grid's 1fr columns did the same to the other tabs before.
test('on a phone no lease tab scrolls sideways', async ({ page }) => {
  const problems = watchPage(page);
  await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', '/leases?status=ACTIVE');
  await page.getByRole('list', { name: 'Lease register' }).getByRole('listitem').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/leases\/[A-Za-z0-9=%]+$/);
  for (const tab of ['overview', 'schedule', 'accounting', 'key-dates', 'documents', 'tasks', 'activity']) {
    await page.evaluate((hash) => { location.hash = hash; }, tab);
    await expect(page.locator(`#lease-panel-${tab}`)).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on the ${tab} tab, in px`).toBeLessThanOrEqual(0);
    // Content can also run past the panel and be clipped by the page without making it scroll, so
    // nothing in the panel may reach beyond it unless it sits in its own scrolling frame.
    const strays = await page.locator(`#lease-panel-${tab}`).evaluate((panel) => {
      const box = panel.getBoundingClientRect();
      const scrolls = (el: Element) => { for (let p = el.parentElement; p && p !== panel; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return true; } return false; };
      return [...panel.querySelectorAll('*')]
        // 12px of slack: MUI's switch label deliberately starts 11px outside its box to align the switch.
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 12 || r.left < box.left - 12) && !scrolls(el); })
        .slice(0, 3).map((el) => `${el.tagName} ${Math.round(el.getBoundingClientRect().width)}px: ${(el.textContent ?? '').slice(0, 40)}`);
    });
    expect(strays, `content past the ${tab} panel's edge`).toEqual([]);
  }
  expect(problems).toEqual([]);
});
