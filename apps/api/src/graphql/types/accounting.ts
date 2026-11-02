import { scheduleJournals, type JournalEntry, type ScheduleRow } from '@tenuro/ledger';
import { leaseAccounting, figuresAt, yearTotals, type LeaseAccountingResult } from '../../domain/accounting.ts';
import { builder } from '../builder.ts';
import type { Context } from '../context.ts';
import { Money, money, decimalString } from './common.ts';
import { Lease } from './lease.ts';
import { Viewer } from './viewer.ts';
import type { LeaseRow } from './lease-shape.ts';

// A lease's IFRS 16 / ASC 842 accounting, computed on demand by the ledger engine: the amounts at
// commencement, today's carrying amounts, the period schedule, journals, remeasurements and the
// maturity of the remaining payments.

interface Shape { lease: LeaseRow; result: LeaseAccountingResult }

const cache = new WeakMap<Context, Map<string, Promise<Shape | null>>>();

async function compute(ctx: Context, lease: LeaseRow): Promise<Shape | null> {
  let m = cache.get(ctx);
  if (!m) { m = new Map(); cache.set(ctx, m); }
  const key = lease.id;
  const hit = m.get(key);
  if (hit) return hit;
  const p = (async () => {
    const [steps, escalations] = await Promise.all([ctx.loaders.rentSteps.load(lease.id), ctx.loaders.escalations.load(lease.id)]);
    try {
      return { lease, result: leaseAccounting(lease as never, steps, escalations as never, ctx.today) };
    } catch {
      return null; // inputs the engine cannot measure (it validates strictly); the UI says so
    }
  })();
  m.set(key, p);
  return p;
}

const cur = (s: Shape) => s.result.schedule.currency;

const Period = builder.objectRef<{ row: ScheduleRow; currency: string }>('AccountingPeriod').implement({
  description: 'One payment period of the lease schedule.',
  fields: (t) => ({
    period: t.int({ resolve: (p) => p.row.period }),
    startDate: t.field({ type: 'Date', resolve: (p) => p.row.startDate }),
    endDate: t.field({ type: 'Date', resolve: (p) => p.row.endDate }),
    paymentDate: t.field({ type: 'Date', resolve: (p) => p.row.paymentDate }),
    openingLiability: t.field({ type: Money, resolve: (p) => money(p.row.openingLiability, p.currency) }),
    payment: t.field({ type: Money, resolve: (p) => money(p.row.payment, p.currency) }),
    interest: t.field({ type: Money, resolve: (p) => money(p.row.interest, p.currency) }),
    closingLiability: t.field({ type: Money, resolve: (p) => money(p.row.closingLiability, p.currency) }),
    depreciation: t.field({ type: Money, resolve: (p) => money(p.row.depreciation, p.currency) }),
    closingRou: t.field({ type: Money, resolve: (p) => money(p.row.closingRou, p.currency) }),
    leaseCost: t.field({ type: Money, resolve: (p) => money(p.row.leaseCost, p.currency) }),
  }),
});

const Line = builder.objectRef<{ account: string; accountName: string; debit: string; credit: string; currency: string }>('JournalLine').implement({
  fields: (t) => ({
    account: t.exposeString('account'),
    accountName: t.exposeString('accountName'),
    debit: t.field({ type: Money, resolve: (l) => money(l.debit, l.currency) }),
    credit: t.field({ type: Money, resolve: (l) => money(l.credit, l.currency) }),
  }),
});

const Journal = builder.objectRef<{ entry: JournalEntry; currency: string }>('JournalEntry').implement({
  description: 'A double-entry journal the schedule produces.',
  fields: (t) => ({
    period: t.int({ resolve: (j) => j.entry.period }),
    date: t.field({ type: 'Date', resolve: (j) => j.entry.date }),
    kind: t.string({ resolve: (j) => j.entry.kind }),
    memo: t.string({ resolve: (j) => j.entry.memo }),
    lines: t.field({ type: [Line], resolve: (j) => j.entry.lines.map((l) => ({ ...l, currency: j.currency })) }),
  }),
});

const Remeasured = builder.objectRef<{ effectiveDate: string; liability: string; rou: string; currency: string }>('Remeasurement').implement({
  description: 'A change in rent (index or market review) applied at the unchanged discount rate.',
  fields: (t) => ({
    effectiveDate: t.field({ type: 'Date', resolve: (r) => r.effectiveDate }),
    liabilityAdjustment: t.field({ type: Money, resolve: (r) => money(r.liability, r.currency) }),
    rouAdjustment: t.field({ type: Money, resolve: (r) => money(r.rou, r.currency) }),
  }),
});

const Band = builder.objectRef<{ key: string; label: string; amount: string; currency: string }>('MaturityBand').implement({
  description: 'Undiscounted lease payments falling due in a band of years from today.',
  fields: (t) => ({
    key: t.exposeString('key'),
    amount: t.field({ type: Money, resolve: (b) => money(b.amount, b.currency) }),
  }),
});

const YearFigures = builder.objectRef<{ year: number; interest: string; depreciation: string; leaseCost: string; cashPaid: string; currency: string }>('AccountingYear').implement({
  description: 'What the lease charges in a calendar year (periods ending in it).',
  fields: (t) => ({
    year: t.exposeInt('year'),
    interest: t.field({ type: Money, resolve: (y) => money(y.interest, y.currency) }),
    depreciation: t.field({ type: Money, resolve: (y) => money(y.depreciation, y.currency) }),
    leaseCost: t.field({ type: Money, resolve: (y) => money(y.leaseCost, y.currency) }),
    cashPaid: t.field({ type: Money, resolve: (y) => money(y.cashPaid, y.currency) }),
  }),
});

const LeaseAccounting = builder.objectRef<Shape>('LeaseAccounting').implement({
  description: 'The lease measured under its accounting standard.',
  fields: (t) => ({
    measuredAs: t.string({ description: 'IFRS16, ASC842_FINANCE or ASC842_OPERATING.', resolve: (s) => s.result.schedule.input.standard }),
    exemption: t.string({ resolve: (s) => s.result.schedule.input.exemption ?? 'NONE' }),
    annualDiscountRate: t.field({ type: 'Decimal', resolve: (s) => decimalString(s.result.schedule.basis.annualDiscountRate) }),
    termPeriods: t.int({ resolve: (s) => s.result.schedule.basis.termPeriods }),
    periodsPerYear: t.int({ resolve: (s) => s.result.schedule.periodsPerYear }),
    initialLiability: t.field({ type: Money, resolve: (s) => money(s.result.schedule.initialLiability, cur(s)) }),
    initialRou: t.field({ type: Money, resolve: (s) => money(s.result.schedule.initialRou, cur(s)) }),
    liabilityToday: t.field({ type: Money, resolve: (s, _a, ctx) => money(figuresAt(s.result.schedule, ctx.today).liability, cur(s)) }),
    rouToday: t.field({ type: Money, resolve: (s, _a, ctx) => money(figuresAt(s.result.schedule, ctx.today).rou, cur(s)) }),
    totalPayments: t.field({ type: Money, resolve: (s) => money(s.result.schedule.totals.payments, cur(s)) }),
    totalInterest: t.field({ type: Money, resolve: (s) => money(s.result.schedule.totals.interest, cur(s)) }),
    maturity: t.field({
      type: [Band],
      resolve: (s, _a, ctx) => figuresAt(s.result.schedule, ctx.today).maturity.bands.map((b) => ({ ...b, currency: cur(s) })),
    }),
    futureInterest: t.field({ type: Money, resolve: (s, _a, ctx) => money(figuresAt(s.result.schedule, ctx.today).maturity.futureInterest, cur(s)) }),
    thisYear: t.field({
      type: YearFigures,
      resolve: (s, _a, ctx) => { const y = Number(ctx.today.slice(0, 4)); return { year: y, ...yearTotals(s.result.schedule, y), currency: cur(s) }; },
    }),
    schedule: t.field({ type: [Period], resolve: (s) => s.result.schedule.rows.map((row) => ({ row, currency: cur(s) })) }),
    remeasurements: t.field({
      type: [Remeasured],
      resolve: (s) => s.result.remeasurements.map((r) => ({ effectiveDate: r.effectiveDate, liability: r.adjustments.liability, rou: r.adjustments.rou, currency: cur(s) })),
    }),
    journals: t.field({
      type: [Journal],
      args: { year: t.arg.int({ required: false, description: 'Only journals dated in this calendar year.' }) },
      resolve: (s, args) => {
        const all = scheduleJournals(s.result.schedule);
        const withRemeasure = [...all, ...s.result.remeasurements.flatMap((r) => (r.journal ? [r.journal] : []))].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        return withRemeasure.filter((e) => !args.year || e.date.startsWith(String(args.year))).map((entry) => ({ entry, currency: cur(s) }));
      },
    }),
  }),
});

builder.objectFields(Lease, (t) => ({
  accounting: t.field({
    type: LeaseAccounting,
    nullable: true,
    complexity: 40,
    description: 'Null when the lease cannot be measured (for example a term shorter than one payment period).',
    resolve: (l, _a, ctx) => compute(ctx, l),
  }),
}));

// The portfolio's accounting at today, in the reporting currency: stored figures for shared leases,
// and leases the person has changed privately measured live in their place.
interface Totals {
  measured: number; unmeasured: number;
  liability: number; rou: number; interest: number; depreciation: number; leaseCost: number; cash: number;
  bands: Record<string, number>;
  byCurrency: Map<string, { liability: number; leases: number }>;
  byStandard: Map<string, number>;
}
const BAND_KEYS = ['WITHIN_1_YEAR', 'YEAR_1_TO_2', 'YEAR_2_TO_3', 'YEAR_3_TO_4', 'YEAR_4_TO_5', 'AFTER_5_YEARS'] as const;
const BAND_COLUMNS = { WITHIN_1_YEAR: 'within_1_year', YEAR_1_TO_2: 'year_1_to_2', YEAR_2_TO_3: 'year_2_to_3', YEAR_3_TO_4: 'year_3_to_4', YEAR_4_TO_5: 'year_4_to_5', AFTER_5_YEARS: 'after_5_years' } as const;

interface SummaryShape { totals: Totals; currency: string; year: number }

async function summarise(ctx: Context, tenantId: string): Promise<SummaryShape> {
  const tenant = (await ctx.loaders.tenant.load(tenantId))!;
  const reporting = tenant.reporting_currency;
  const rates = new Map((await ctx.tx.selectFrom('fx_rate').select(['currency', 'per_usd']).orderBy('on_date', 'desc').execute()).reverse().map((r) => [r.currency, Number(r.per_usd)]));
  const toReporting = (amount: number, cur: string) => (amount / (rates.get(cur) ?? 1)) * (rates.get(reporting) ?? 1);
  const year = Number(ctx.today.slice(0, 4));
  const totals: Totals = { measured: 0, unmeasured: 0, liability: 0, rou: 0, interest: 0, depreciation: 0, leaseCost: 0, cash: 0,
    bands: Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), byCurrency: new Map(), byStandard: new Map() };
  const add = (cur: string, standard: string, f: { liability: number; rou: number; interest: number; depreciation: number; leaseCost: number; cash: number; bands: Record<string, number> }) => {
    totals.measured += 1;
    totals.liability += toReporting(f.liability, cur); totals.rou += toReporting(f.rou, cur);
    totals.interest += toReporting(f.interest, cur); totals.depreciation += toReporting(f.depreciation, cur);
    totals.leaseCost += toReporting(f.leaseCost, cur); totals.cash += toReporting(f.cash, cur);
    for (const k of BAND_KEYS) totals.bands[k]! += toReporting(f.bands[k] ?? 0, cur);
    const c = totals.byCurrency.get(cur) ?? { liability: 0, leases: 0 };
    c.liability += f.liability; c.leases += 1; totals.byCurrency.set(cur, c);
    totals.byStandard.set(standard, (totals.byStandard.get(standard) ?? 0) + 1);
  };

  // Shared leases: their stored figures (only rows the person sees unchanged).
  const stored = await ctx.tx.selectFrom('v_lease as l').innerJoin('lease_accounting as a', 'a.lease_row_id', 'l.id')
    .where('l.status', 'in', ['ACTIVE', 'HOLDING_OVER'])
    .select(['a.currency', 'a.measured_as', 'a.liability', 'a.rou', 'a.interest_year', 'a.depreciation_year', 'a.lease_cost_year', 'a.cash_year',
      'a.within_1_year', 'a.year_1_to_2', 'a.year_2_to_3', 'a.year_3_to_4', 'a.year_4_to_5', 'a.after_5_years'])
    .execute();
  for (const r of stored) {
    add(r.currency, r.measured_as, {
      liability: Number(r.liability), rou: Number(r.rou), interest: Number(r.interest_year), depreciation: Number(r.depreciation_year),
      leaseCost: Number(r.lease_cost_year), cash: Number(r.cash_year),
      bands: Object.fromEntries(BAND_KEYS.map((k) => [k, Number(r[BAND_COLUMNS[k]])])),
    });
  }
  // Leases with no stored figures (changed or added in the person's session): measured live.
  const live = await ctx.tx.selectFrom('v_lease as l').leftJoin('lease_accounting as a', 'a.lease_row_id', 'l.id')
    .where('l.status', 'in', ['ACTIVE', 'HOLDING_OVER']).where('a.lease_row_id', 'is', null).selectAll('l').limit(500).execute();
  for (const l of live as LeaseRow[]) {
    const s = await compute(ctx, l);
    if (!s) { totals.unmeasured += 1; continue; }
    const at = figuresAt(s.result.schedule, ctx.today);
    const y = yearTotals(s.result.schedule, year);
    add(s.result.schedule.currency, s.result.schedule.input.standard, {
      liability: Number(at.liability), rou: Number(at.rou), interest: Number(y.interest), depreciation: Number(y.depreciation),
      leaseCost: Number(y.leaseCost), cash: Number(y.cashPaid),
      bands: Object.fromEntries(at.maturity.bands.map((b) => [b.key, Number(b.amount)])),
    });
  }
  return { totals, currency: reporting, year };
}

const amount = (n: number, currency: string) => money(n.toFixed(2), currency);

const CurrencyLiability = builder.objectRef<{ currency: string; liability: number; leases: number }>('CurrencyLiability').implement({
  description: 'Lease liability held in one lease currency (not converted).',
  fields: (t) => ({
    leases: t.exposeInt('leases'),
    liability: t.field({ type: Money, resolve: (c) => amount(c.liability, c.currency) }),
  }),
});

const PortfolioBand = builder.objectRef<{ key: string; amount: number; currency: string }>('PortfolioMaturityBand').implement({
  fields: (t) => ({
    key: t.exposeString('key'),
    amount: t.field({ type: Money, resolve: (b) => amount(b.amount, b.currency) }),
  }),
});

const AccountingSummary = builder.objectRef<SummaryShape>('AccountingSummary').implement({
  description: 'The portfolio’s lease accounting at today, converted to the reporting currency at the company’s rates.',
  fields: (t) => ({
    year: t.exposeInt('year'),
    leasesMeasured: t.int({ resolve: (s) => s.totals.measured }),
    leasesUnmeasured: t.int({ resolve: (s) => s.totals.unmeasured }),
    liability: t.field({ type: Money, resolve: (s) => amount(s.totals.liability, s.currency) }),
    rou: t.field({ type: Money, resolve: (s) => amount(s.totals.rou, s.currency) }),
    interestThisYear: t.field({ type: Money, resolve: (s) => amount(s.totals.interest, s.currency) }),
    depreciationThisYear: t.field({ type: Money, resolve: (s) => amount(s.totals.depreciation, s.currency) }),
    leaseCostThisYear: t.field({ type: Money, resolve: (s) => amount(s.totals.leaseCost, s.currency) }),
    cashThisYear: t.field({ type: Money, resolve: (s) => amount(s.totals.cash, s.currency) }),
    currentLiability: t.field({ type: Money, description: 'Due within a year (undiscounted payments in the first band, capped at the liability).',
      resolve: (s) => amount(Math.min(s.totals.bands.WITHIN_1_YEAR ?? 0, s.totals.liability), s.currency) }),
    maturity: t.field({ type: [PortfolioBand], resolve: (s) => BAND_KEYS.map((k) => ({ key: k, amount: s.totals.bands[k] ?? 0, currency: s.currency })) }),
    byCurrency: t.field({ type: [CurrencyLiability], resolve: (s) => [...s.totals.byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })).sort((a, b) => b.leases - a.leases) }),
    byStandard: t.field({
      type: [builder.objectRef<{ standard: string; leases: number }>('StandardCount').implement({ fields: (u) => ({ standard: u.exposeString('standard'), leases: u.exposeInt('leases') }) })],
      resolve: (s) => [...s.totals.byStandard.entries()].map(([standard, leases]) => ({ standard, leases })),
    }),
  }),
});

const summaries = new WeakMap<Context, Promise<SummaryShape>>();
builder.objectFields(Viewer, (t) => ({
  accountingSummary: t.field({
    type: AccountingSummary,
    complexity: 40,
    resolve: (s, _a, ctx) => {
      let p = summaries.get(ctx);
      if (!p) { p = summarise(ctx, s.tenantId); summaries.set(ctx, p); }
      return p;
    },
  }),
}));
