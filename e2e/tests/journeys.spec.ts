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

  test('signing in lands on the portfolio overview, whose figures lead into the register', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', null);
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Needs attention', 'Expiry profile', 'Where the rent is', 'Rent by country', 'Critical dates', 'Recent activity']) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    await expectAccessible(page, 'portfolio overview');
    await page.getByRole('link', { name: /Holding over/ }).first().click();
    await expect(page).toHaveURL(/\/leases\?status=HOLDING_OVER/);
    await expect(page.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
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

    // The keyboard: Space previews the focused lease (announced), Escape closes it, "/" goes to search.
    const firstRow = grid.getByRole('row').nth(1);
    const reference = (await firstRow.locator('[data-field="reference"]').innerText()).trim();
    await firstRow.locator('[data-field="landlord"]').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status').filter({ hasText: 'Press Enter to open' })).toContainText(reference);
    await expect(page.getByText('Click or press Enter to open the lease')).toBeVisible();
    await expectAccessible(page, 'register with a lease preview');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Click or press Enter to open the lease')).toBeHidden();
    await page.keyboard.press('/');
    const search = page.getByRole('searchbox', { name: 'Search leases' }).or(page.getByLabel('Search leases')).first();
    await expect(search).toBeFocused();
    await search.fill('Nairobi');
    await expect(page).toHaveURL(/[?&]q=Nairobi/);
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
    // The overview, right to left: nothing pushes the page sideways (hidden labels once did).
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'المحفظة' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'overview overflow in Arabic').toBeLessThanOrEqual(0);
    await expectAccessible(page, 'overview in Arabic');
    expect(problems).toEqual([]);
  });

  test('a page asks for its data as it loads, and only once', async ({ page }) => {
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', null);
    for (const path of ['/leases', '/', '/accounting', '/key-dates']) {
      const ids: string[] = [];
      const onRequest = (r: import('@playwright/test').Request) => {
        if (r.url().endsWith('/graphql') && r.method() === 'POST') ids.push((JSON.parse(r.postData() ?? '{}') as { id?: string }).id ?? '');
      };
      page.on('request', onRequest);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      page.off('request', onRequest);
      // The shell's query and the page's are sent once each: an early answer the app did not use would
      // show as the same query twice. (The register also prefetches its next page, a different query.)
      expect(ids.length, `GraphQL requests on ${path}`).toBeGreaterThanOrEqual(2);
      expect(new Set(ids).size, `repeated queries on ${path}: ${ids.map((i) => i.slice(0, 8)).join(', ')}`).toBe(ids.length);
    }
  });

  test('each page names its route\'s code up front, and the build manifest is not served', async ({ request }) => {
    const html = await (await request.get('/leases')).text();
    expect(html).toMatch(/<link rel="modulepreload" crossorigin href="\/assets\/RegisterPage-[^"]+\.js">/);
    const lease = await (await request.get('/leases/abc')).text();
    expect(lease).toMatch(/href="\/assets\/LeasePage-[^"]+\.js"/);
    expect(lease).not.toMatch(/RegisterPage-/);
    expect((await request.get('/.vite/manifest.json')).headers()['content-type'] ?? '').not.toMatch(/json/);
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

test.describe('key dates', () => {
  test('a manager works the key dates as a list, a calendar and the next 90 days', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', '/key-dates');
    await expect(page.getByRole('heading', { level: 1, name: 'Key dates' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Key dates' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Done' }).first()).toBeVisible();
    await expectAccessible(page, 'key dates list');

    await page.getByRole('button', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/view=calendar/);
    const day = page.getByRole('button', { pressed: false, name: /: \d+ dates?$/ }).first();
    await day.click();
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('status').filter({ hasText: /\d+ dates?/ }).first()).toBeVisible();
    await expectAccessible(page, 'key dates calendar');

    await page.getByRole('button', { name: 'Next 90 days' }).click();
    await expect(page).toHaveURL(/view=next90/);
    await page.getByRole('button', { name: 'Rent review', exact: true }).click();
    await expect(page).toHaveURL(/kind=RENT_REVIEW/);
    expect(problems).toEqual([]);
  });
});

test.describe('accounting', () => {
  test('the portfolio accounting reads at today, exports, and a lease shows its schedule and journals', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Portfolio admin', '/accounting');
    await expect(page.getByRole('heading', { level: 1, name: 'Accounting' })).toBeVisible();
    await expect(page.getByText('Lease liability today', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Maturity of remaining payments' })).toBeVisible();
    await expectAccessible(page, 'accounting');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^accounting-\d{4}-\d{2}-\d{2}\.csv$/);

    await page.goto('/leases?status=ACTIVE');
    await page.getByRole('grid').getByRole('row').nth(1).getByRole('link').first().click();
    await page.getByRole('tab', { name: 'Accounting' }).click();
    await expect(page.getByText('Lease liability today')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Period schedule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Journals in \d{4}$/ })).toBeVisible();
    await expectAccessible(page, 'lease accounting');
    expect(problems).toEqual([]);
  });
});

test.describe('reports', () => {
  test('a viewer downloads the lease register as CSV and rent by location as Excel', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Halvard & Crane Property Partners', 'Read-only viewer', '/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
    await expectAccessible(page, 'reports');
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', description: 'Lease register' }).click();
    const file = await csv;
    expect(file.suggestedFilename()).toMatch(/^lease-register-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await (await file.createReadStream())!.toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
    expect(text.split('\r\n')[0]).toContain('Reference,Status,Property');
    expect(text.split('\r\n').length).toBeGreaterThan(100);
    const xlsx = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel', description: 'Rent by location' }).click();
    expect((await xlsx).suggestedFilename()).toMatch(/^rent-by-location-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(problems).toEqual([]);
  });
});

test.describe('documents', () => {
  test('the lease agreement and demise plan preview from the lease page', async ({ page }) => {
    const problems = watchPage(page);
    await signIn(page, 'Mbuyu Court Holdings', 'Lease manager', '/leases?status=ACTIVE');
    await page.getByRole('grid').getByRole('row').nth(1).getByRole('link').first().click();
    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByRole('button', { name: /^Lease agreement/ })).toBeVisible();
    await expectAccessible(page, 'lease documents');
    await page.getByRole('button', { name: /^Lease agreement/ }).click();
    // The frame allows no scripts, so its content is checked over HTTP rather than by reaching into it
    // (Playwright's own injected script would be blocked and logged).
    const src = await page.locator('iframe[title="Lease agreement"]').getAttribute('src');
    const doc = await page.request.get(src!);
    expect(doc.headers()['content-security-policy']).toMatch(/^sandbox/);
    expect(await doc.text()).toMatch(/<h1>Lease agreement<\/h1>/);
    await expect(page.getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', /\/api\/documents\//);
    await expect(page.locator('iframe[title="Lease agreement"]')).toHaveAttribute('sandbox', '');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Demise plan/ }).click();
    await expect(page.getByRole('img', { name: 'Demise plan' })).toBeVisible();
    await page.keyboard.press('Escape');
    // A manager attaches a file: it is checked, given a kind and a title, and listed straight away.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
    await page.locator('input[type="file"]').setInputFiles({ name: 'Landlord letter.pdf', mimeType: 'application/pdf', buffer: pdf });
    const dialog = page.getByRole('dialog', { name: 'Attach a file to this lease' });
    await expect(dialog).toBeVisible();
    await expectAccessible(page, 'attach a file');
    await dialog.getByRole('button', { name: 'Attach' }).click();
    await expect(page.getByText('Attached Landlord letter.pdf')).toBeVisible();
    await expect(page.getByText('Landlord letter', { exact: true })).toBeVisible();
    // Chrome reports the sandbox refusing Playwright's own injected script in the document frame; that refusal
    // is the sandbox doing its job (the documents themselves carry no scripts), so only that one message is set aside.
    const sandboxNotice = /^console: Blocked script execution in '[^']*\/api\/documents\/[^']+' because the document's frame is sandboxed/;
    expect(problems.filter((p) => !sandboxNotice.test(p))).toEqual([]);
  });
});

test.describe('figures fit their tiles', () => {
  // Exact KES amounts once ran past their tiles on the accounting page. Every KPI tile, for each
  // company (KES has the longest figures), at desktop, tablet and phone widths.
  // Each company in English, and in its other working language (Arabic figures read "607.5 مليون AED").
  for (const [company, language] of [['Mbuyu Court Holdings', 'en'], ['Mbuyu Court Holdings', 'sw'], ['Sunbula Estates', 'en'], ['Sunbula Estates', 'ar'], ['Halvard & Crane Property Partners', 'en']] as const) {
    test(`nothing overflows a KPI tile for ${company} in ${language}`, async ({ page }) => {
      await signIn(page, company, 'Read-only viewer', '/leases?status=ACTIVE');
      await page.evaluate((l) => { if (l === 'en') localStorage.removeItem('tenuro.language'); else localStorage.setItem('tenuro.language', l); }, language);
      const lease = await page.locator('a[href^="/leases/"]:not([href="/leases/new"])').first().getAttribute('href');
      const overflowing = () => page.evaluate(() => {
        const bad: string[] = [];
        for (const tile of document.querySelectorAll<HTMLElement>('[data-kpi]')) {
          const box = tile.getBoundingClientRect();
          if (tile.scrollWidth > tile.clientWidth + 1) bad.push(`tile scrolls: ${tile.innerText.slice(0, 60)}`);
          for (const el of tile.querySelectorAll<HTMLElement>('*')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.left < box.left - 1 || r.right > box.right + 1) { bad.push(`${el.innerText.slice(0, 40)} (${Math.round(r.left)}–${Math.round(r.right)} in ${Math.round(box.left)}–${Math.round(box.right)})`); break; }
          }
        }
        return bad;
      });
      for (const width of [1440, 820, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['/', '/accounting', `${lease}#accounting`]) {
          await page.goto(path);
          if (path.includes('#')) await page.reload();
          await expect(page.locator('[data-kpi]').first()).toBeVisible();
          await page.waitForLoadState('networkidle');
          expect(await overflowing(), `${company} (${language}) ${path} at ${width}px`).toEqual([]);
        }
      }
    });
  }
});

