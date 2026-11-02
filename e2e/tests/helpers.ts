import AxeBuilder from '@axe-core/playwright';
import { expect, type ConsoleMessage, type Page } from '@playwright/test';

export type Company = 'Mbuyu Court Holdings' | 'Sunbula Estates' | 'Halvard & Crane Property Partners';
export type Role = 'Portfolio admin' | 'Lease manager' | 'Read-only viewer';

// Collects console errors and failed requests; any of them fails the test that saw it.
export function watchPage(page: Page) {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

const SHORT_ROLE: Record<Role, string> = { 'Portfolio admin': 'Admin', 'Lease manager': 'Manager', 'Read-only viewer': 'Viewer' };

// Finds the button the way a screen-reader user meets it: the group named after the company, then
// the role named on the button (each company's buttons are a labelled group, so "Admin" is never
// announced without its company).
// Signing in lands on the portfolio overview; most journeys then go on to the register.
export async function signIn(page: Page, company: Company, role: Role, then: string | null = '/leases') {
  await page.goto('/sign-in');
  const section = page.getByRole('group', { name: company });
  await section.getByRole('button', { name: new RegExp(`^${SHORT_ROLE[role]}\\b`) }).click();
  await page.waitForURL((url) => url.pathname === '/');
  if (then) await page.goto(then);
}

// WCAG 2.1 A and AA rules across the whole page; failures name each offending element.
export async function expectAccessible(page: Page, label: string) {
  // Not for pages showing a sandboxed document frame: axe cannot inject into a frame that allows no
  // scripts and waits for it. The documents journey checks the tab before opening a preview.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}`));
  expect(summary, `axe violations on ${label}`).toEqual([]);
}
