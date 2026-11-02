# Tenuro

Tenuro manages commercial lease portfolios. It holds the lease register and its key dates, and it
does the lease accounting under IFRS 16 and ASC 842, with reports for finance teams that run
leases across several countries, currencies and languages.

**Live at [tenuro.jeffgicharu.com](https://tenuro.jeffgicharu.com).** Choose a company and a role
on the sign-in page; no account is needed. Your changes are private to your session, and the
portfolio is rebuilt every night at 03:00 East Africa Time.

![The portfolio overview: passing rent, WAULT, expiries, and the decisions that need attention](docs/screenshots/dashboard.webp)

## What it does

| | |
|---|---|
| **Portfolio overview** | Passing rent, weighted unexpired term, expiries by year, rent by country, property type and city on a map, and the decisions due: break and renewal notices, rent reviews and expiries, ranked by the rent at stake. |
| **Lease register** | A data grid of every lease, with search, filters, column choice and saved views. Every filter lives in the URL. On a phone it becomes a card list. |
| **Lease page** | Parties, premises, term, options, rent and its schedule, deposits, accounting, key dates, documents, tasks and the activity trail. |
| **Lease form** | Eight sections with validation on each step, an error summary, autosave and amendments. The same rules run in the browser and on the server (`packages/lease-rules`). |
| **Key dates** | A list, a month calendar (with week start and weekends set by the company's locale), and reminders. Dates can be marked done, dismissed or reassigned. |
| **Lease accounting** | Schedules, journals, remeasurements on index and market reviews, and the maturity analysis for each lease. For the portfolio: the year-to-date liability roll-forward, the monthly charge, the largest liabilities and the split by country, currency and standard. |
| **Reports** | Six standard reports, each as CSV or an Excel workbook (the XLSX writer has no dependencies). |
| **Documents** | The lease agreement and rent review memorandum are drawn from the lease as printable HTML (right to left in Arabic). The demise plan is an SVG drawn to the premises' area. Uploads are supported too. |
| **Companies, themes and languages** | Three companies, each with its own brand colours, density, reporting currency and working language: English, Arabic (fully right to left) or Kiswahili. Light and dark modes are included. Roles are admin, manager and read-only viewer. |

| | |
|---|---|
| ![Lease accounting on the lease page](docs/screenshots/lease-accounting.webp) | ![Portfolio accounting: roll-forward and monthly charge](docs/screenshots/accounting.webp) |
| ![Key dates calendar with reminders](docs/screenshots/key-dates-calendar.webp) | ![The lease register](docs/screenshots/register.webp) |
| ![The Gulf company's overview in Arabic, dark mode](docs/screenshots/dashboard-arabic-dark.webp) | ![The lease agreement preview](docs/screenshots/document-preview.webp) |
| ![The lease form](docs/screenshots/lease-form.webp) | ![On a phone: overview and lease](docs/screenshots/phone.webp) |

## How it is built

```
apps/web          React 19, TypeScript (strict), Vite, MUI, Relay, react-intl
apps/api          GraphQL server: Pothos and GraphQL Yoga on Node 22, Kysely, PostgreSQL 16
packages/ledger   The lease accounting engine (IFRS 16 / ASC 842), pure TypeScript
packages/lease-rules   Lease validation shared by the form and the API
e2e               Playwright journeys with axe accessibility checks
deploy            Server install, systemd units, nginx, blue/green activation
```

- **Relay all the way through.** Routes start their query as navigation begins (render-as-you-fetch).
  In production the API runs only the persisted queries the Relay compiler wrote at build time.
- **Tenancy in the database.** Every request runs in one transaction with the company set locally,
  and row-level security applies to every statement. The app's role cannot bypass it.
- **Private sessions.** A visitor's changes are copy-on-write rows in their own sandbox. Views
  (`v_lease`, `v_key_date` and the rest) show the shared portfolio with that person's changes laid
  over it, so nobody sees anyone else's edits. Quotas cap what one session or address can create.
- **The ledger.** Amounts are decimals at 34 significant digits, and rounding follows each
  currency's minor unit. Remeasurements rebuild only the periods they change. The method, and three
  leases worked to the cent, are in [docs/accounting](docs/accounting/method.md). The
  [worked examples](docs/accounting/worked-examples.md) are checked against an independent Python
  implementation of the same method. Property tests check the invariants on random leases: balances
  end at zero, journals balance, the ledger agrees with the schedule, the maturity analysis
  reconciles, and a series of changes equals the same changes one at a time.
- **Security.**
  - Each page gets a nonce-based Content Security Policy with no `unsafe-inline`.
  - Documents are served sandboxed, with a script-free CSP.
  - Session cookies are `__Host-` cookies.
  - Writes need a header that a cross-site request cannot add.
  - Query depth, complexity and alias limits apply.
  - Rate limits are enforced in nginx.
  - CI scans the whole history for secrets, runs CodeQL and audits dependencies.
- **Operations.**
  - Two app slots (blue and green). A release is checked on the idle slot, switched over through
    nginx and checked again, and it rolls back on failure.
  - The nightly rebuild replaces the shared portfolio in one transaction.
  - A nightly `pg_dump` runs, and a weekly restore test verifies the restored copy against a
    manifest.
  - GraphQL responses carry `Server-Timing`: the database time, the slowest statements and the
    slowest fields.

## Quality, measured

**Tests.** All of these run in CI on every pull request, and nothing merges unless they pass.

| Suite | Count |
|---|---|
| Web unit and component tests (Vitest, Testing Library) | 114 |
| Ledger unit, worked-example and property tests (fast-check) | 44 |
| Lease rules | 12 |
| API tests against PostgreSQL 16, as the app's own role under row-level security | 51 |
| End-to-end journeys in a production build, with axe on each page (Playwright) | 15 |

CI also builds the release:
- It enforces the bundle budget.
- It runs the server on a baseline x86-64 CPU under QEMU.
- It migrates and seeds a fresh database within the server's memory cap, and reports the cost of
  the nightly rebuild.
- It backs up, restores and verifies.
- It boots in production mode for smoke checks.

**Accessibility.** I ran axe 4.14 on the live site, with WCAG 2.0, 2.1 and 2.2 A/AA and best
practice. It covered 16 pages and lease tabs in English light, English dark and Arabic light, plus
the sign-in page: **49 page states, 0 violations.** Colour tokens are unit-tested for 4.5:1
contrast in both modes. Controls show a visible focus ring, and motion respects
`prefers-reduced-motion`.

**Performance.** Measured on the live site from Nairobi (round trip to the server about 250 ms) on
3 November 2026, as the largest contentful paint (LCP) and cumulative layout shift (CLS) in Chrome:

- **Desktop:** a 1440 × 900 window, no throttling. "Cold" has the cache disabled; "warm" is a
  second visit.
- **Phone:** a 390 × 844 window at 2× pixel density, cache disabled, throttled through the Chrome
  DevTools Protocol to 150 ms latency, 1.6 Mbps down and 4× CPU slowdown. Each figure is the median
  of three runs. This applied throttling is harsher than Lighthouse's simulated throttling.

| Page | LCP, desktop, cold | LCP, desktop, warm | LCP, phone (throttled) | CLS |
|---|---|---|---|---|
| Sign-in | 1.8–1.9 s | 1.2 s | 3.8 s | 0.001 |
| Portfolio overview | 1.6 s | 0.9 s | 4.1 s | 0.000 |
| Lease register | 1.6–1.9 s | 0.9 s | 4.4 s | 0.000 |
| Accounting | 1.6–1.7 s | 0.9 s | 3.8 s | 0.003 |
| Key dates | 1.6 s | 0.9 s | 5.4 s | 0.000 |

On the throttled phone, about 400 KB of JavaScript crossing 1.6 Mbps and then the 4× slower CPU
set the time. A page's data does not: a 0.1 KB script asks for the shell's and the route's data as
the page loads (overview, register, accounting and lease pages), and the server names each route's
code in the page it sends. Phones never download the register's data grid; they show a card list
that starts with 20 leases. Key dates is not yet covered by the early data request.

| JavaScript, gzip | Size | Budget |
|---|---|---|
| First page (entry and its static imports) | 284 KB | 295 KB |
| Message catalogue (one language) | 11.5–13.8 KB | |
| Lease register route on a phone (card list) | 59 KB | 180 KB |
| Its data grid, desktop only, on top of the route | 149 KB | 180 KB |
| Lease form route | 131 KB | 180 KB |
| Lease page route | 113 KB | 180 KB |
| Other routes | 8 to 48 KB each | 180 KB |

Server time for the heaviest pages fell from 1.0–1.75 s to 0.3–0.8 s after `Server-Timing`
showed where it went. Two fixes did most of it. Lookups by a row's view id now use an index that
row-level security allows. The accounting summary is now summed in the database instead of the API.

**Storybook.** The component library, in every theme, language and mode, is at
[tenuro.jeffgicharu.com/storybook](https://tenuro.jeffgicharu.com/storybook/).

## Running it locally

You need Node 22 (see `.nvmrc`), pnpm 10 and PostgreSQL 16.

```bash
pnpm install

# Two roles: an owner for migrations and the nightly rebuild, and the app's role, which row-level
# security applies to.
psql -U postgres <<'SQL'
CREATE ROLE tenuro LOGIN PASSWORD 'owner-password';
CREATE ROLE tenuro_app LOGIN PASSWORD 'app-password';
CREATE DATABASE tenuro OWNER tenuro;
REVOKE ALL ON DATABASE tenuro FROM PUBLIC;
GRANT CONNECT ON DATABASE tenuro TO tenuro_app;
SQL

cat > .env.local <<'ENV'
OWNER_DATABASE_URL=postgres://tenuro:owner-password@127.0.0.1:5432/tenuro
DATABASE_URL=postgres://tenuro_app:app-password@127.0.0.1:5432/tenuro
ENV

pnpm --filter @tenuro/api migrate   # schema, grants and row-level security
pnpm --filter @tenuro/api seed      # the three companies' portfolios (SEED_SCALE=0.1 for a smaller one)
scripts/dev.sh                      # API on :4000, web on :5173
```

Other commands are `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm --filter @tenuro/web
storybook`. API tests need the two roles and a `tenuro_test` database (see `.github/workflows/ci.yml`).

## Layout

| Path | What is there |
|---|---|
| `apps/web/src/features/*` | One folder per page: register, lease, lease form, key dates, accounting, reports, documents, dashboard, sign-in |
| `apps/web/src/theme`, `apps/web/src/i18n` | Design tokens and themes; the English, Arabic and Kiswahili catalogues |
| `apps/api/src/graphql` | Schema types, mutations and plugins (scoped transactions, persisted queries, limits, timing) |
| `apps/api/src/db/migrations` | Checksummed SQL migrations. Applied ones are never edited. |
| `apps/api/src/seed` | The nightly rebuild |
| `packages/ledger` | The accounting engine, its tests and fixtures |
| `deploy` | [Server install guide](deploy/README.md), systemd units, nginx site, activation scripts |
| `docs/accounting` | The accounting method and the worked examples |
