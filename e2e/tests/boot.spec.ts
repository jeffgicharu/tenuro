import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers.ts';

// Boots the real production bundle in a browser. The server-side smoke run cannot see failures
// that only happen when the browser evaluates the chunks (a chunk import cycle once made the
// register crash with styled(undefined)) or when the CSP blocks something.
function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text().slice(0, 160)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return problems;
}

// Records the details of every CSP violation (where it came from and what was blocked), which the
// console message alone does not say.
const consoleLog = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const lines: string[] = [];
  consoleLog.set(page, lines);
  page.on('console', (m) => lines.push(`${m.type()}: ${m.text().slice(0, 400)}`));
  page.on('pageerror', (e) => lines.push(`pageerror: ${e.message} ${e.stack?.split('\n').slice(0, 3).join(' | ') ?? ''}`));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} from ${e.sourceFile || '(inline)'}:${e.lineNumber}:${e.columnNumber} excerpt=${JSON.stringify(e.sample)} element=${(e.target as Element)?.outerHTML?.slice(0, 120) ?? ''}`);
    });
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
  console.log(`--- ${info.title}\nurl: ${page.url()}\nlang: ${await page.locator('html').getAttribute('lang')}\ncsp: ${JSON.stringify(csp, null, 1)}\ntext: ${text}\nconsole:\n  ${(consoleLog.get(page) ?? []).join('\n  ')}`);
});

test('a manager signs in, reads the register and opens a lease without a single error', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, 'Mbuyu Court Holdings', 'Lease manager');
  await expect(page.getByRole('heading', { name: 'Leases', level: 1 })).toBeVisible();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible();
  await expect(page.getByText(/^Rows 1–100 of/)).toBeVisible();
  // The default columns fit a 1440 px screen beside the open navigation: nothing scrolls sideways.
  const overflow = await page.locator('.MuiDataGrid-virtualScroller').evaluate((s) => s.scrollWidth - s.clientWidth);
  expect(overflow, 'register overflow at 1440 px').toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/^Rows 101–200 of/)).toBeVisible();

  await page.locator('.MuiDataGrid-row').first().click();
  await page.waitForURL(/\/leases\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the register renders right to left in Arabic without errors', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, 'Sunbula Estates', 'Portfolio admin');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('عقود الإيجار');
  await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible();
  expect(problems).toEqual([]);
});
