import { scheduleJournals, type JournalEntry, type ScheduleRow } from '@tenuro/ledger';
import { sql } from 'kysely';
import { leaseAccounting, figuresAt, rollForward, yearTotals, type LeaseAccountingResult } from '../../domain/accounting.ts';
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
interface Figures {
  liability: number; rou: number; interest: number; depreciation: number; leaseCost: number; cash: number;
  bands: Record<string, number>;
  open: number; additions: number; interestYtd: number; payments: number; remeasure: number; close: number;
  monthlyInterest: number[]; monthlyDepreciation: number[]; monthlyCost: number[];
}
interface Totals extends Figures {
  measured: number; unmeasured: number;
  byCurrency: Map<string, { liability: number; leases: number }>;
  byStandard: Map<string, number>;
  byCountry: Map<string, { liability: number; leases: number }>;
  leases: { leaseId: string; reference: string; property: string; city: string; liability: number; local: number; currency: string }[];
}
const BAND_KEYS = ['WITHIN_1_YEAR', 'YEAR_1_TO_2', 'YEAR_2_TO_3', 'YEAR_3_TO_4', 'YEAR_4_TO_5', 'AFTER_5_YEARS'] as const;
const BAND_COLUMNS = { WITHIN_1_YEAR: 'within_1_year', YEAR_1_TO_2: 'year_1_to_2', YEAR_2_TO_3: 'year_2_to_3', YEAR_3_TO_4: 'year_3_to_4', YEAR_4_TO_5: 'year_4_to_5', AFTER_5_YEARS: 'after_5_years' } as const;
const zeros = () => Array<number>(12).fill(0);

interface SummaryShape { totals: Totals; currency: string; year: number }
interface GroupRow {
  currency: string; measured_as: string; country_code: string; n: number;
  liability: string; rou: string; interest: string; depreciation: string; lease_cost: string; cash: string;
  within_1_year: string; year_1_to_2: string; year_2_to_3: string; year_3_to_4: string; year_4_to_5: string; after_5_years: string;
  open: string; additions: string; interest_ytd: string; payments: string; remeasure: string; close: string;
  /** mi1..mi12, md1..md12, mc1..mc12: the monthly interest, depreciation and lease cost. */
  [month: `${'mi' | 'md' | 'mc'}${number}`]: string;
}

async function summarise(ctx: Context, tenantId: string): Promise<SummaryShape> {
  const tenant = (await ctx.loaders.tenant.load(tenantId))!;
  const reporting = tenant.reporting_currency;
  const rates = new Map((await ctx.tx.selectFrom('fx_rate').select(['currency', 'per_usd']).orderBy('on_date', 'desc').execute()).reverse().map((r) => [r.currency, Number(r.per_usd)]));
  const fx = (amount: number, cur: string) => (amount / (rates.get(cur) ?? 1)) * (rates.get(reporting) ?? 1);
  const year = Number(ctx.today.slice(0, 4));
  const totals: Totals = {
    measured: 0, unmeasured: 0, liability: 0, rou: 0, interest: 0, depreciation: 0, leaseCost: 0, cash: 0,
    bands: Object.fromEntries(BAND_KEYS.map((k) => [k, 0])), open: 0, additions: 0, interestYtd: 0, payments: 0, remeasure: 0, close: 0,
    monthlyInterest: zeros(), monthlyDepreciation: zeros(), monthlyCost: zeros(),
    byCurrency: new Map(), byStandard: new Map(), byCountry: new Map(), leases: [],
  };
  // Adds figures for `n` leases in one currency, standard and country (a group of stored rows, or one
  // lease measured live). Conversion is linear, so converting a group's exact sum is the same as
  // converting each lease and adding.
  const add = (country: string, cur: string, standard: string, n: number, f: Figures) => {
    totals.measured += n;
    for (const k of ['liability', 'rou', 'interest', 'depreciation', 'leaseCost', 'cash', 'open', 'additions', 'interestYtd', 'payments', 'remeasure', 'close'] as const) totals[k] += fx(f[k], cur);
    for (const k of BAND_KEYS) totals.bands[k]! += fx(f.bands[k] ?? 0, cur);
    for (let m = 0; m < 12; m++) {
      totals.monthlyInterest[m]! += fx(f.monthlyInterest[m] ?? 0, cur);
      totals.monthlyDepreciation[m]! += fx(f.monthlyDepreciation[m] ?? 0, cur);
      totals.monthlyCost[m]! += fx(f.monthlyCost[m] ?? 0, cur);
    }
    const c = totals.byCurrency.get(cur) ?? { liability: 0, leases: 0 };
    c.liability += f.liability; c.leases += n; totals.byCurrency.set(cur, c);
    const k = totals.byCountry.get(country) ?? { liability: 0, leases: 0 };
    k.liability += fx(f.liability, cur); k.leases += n; totals.byCountry.set(country, k);
    totals.byStandard.set(standard, (totals.byStandard.get(standard) ?? 0) + n);
  };

  // Shared leases: their stored figures (only rows the person sees unchanged), summed in the database
  // by currency, standard and country (the twelve months element by element), and the ten largest.
  const LIVE = sql`l.status IN ('ACTIVE', 'HOLDING_OVER')`;
  const [groups, largest] = await Promise.all([
    sql<GroupRow>`
      SELECT a.currency, a.measured_as, l.country_code, count(*)::int AS n,
        sum(a.liability)::text AS liability, sum(a.rou)::text AS rou, sum(a.interest_year)::text AS interest,
        sum(a.depreciation_year)::text AS depreciation, sum(a.lease_cost_year)::text AS lease_cost, sum(a.cash_year)::text AS cash,
        sum(a.within_1_year)::text AS within_1_year, sum(a.year_1_to_2)::text AS year_1_to_2, sum(a.year_2_to_3)::text AS year_2_to_3,
        sum(a.year_3_to_4)::text AS year_3_to_4, sum(a.year_4_to_5)::text AS year_4_to_5, sum(a.after_5_years)::text AS after_5_years,
        sum(a.liability_open)::text AS open, sum(a.additions_ytd)::text AS additions, sum(a.interest_ytd)::text AS interest_ytd,
        sum(a.payments_ytd)::text AS payments, sum(a.remeasure_ytd)::text AS remeasure, sum(a.liability_close)::text AS close,
        sum(coalesce(a.monthly_interest[1], 0))::text AS mi1, sum(coalesce(a.monthly_interest[2], 0))::text AS mi2, sum(coalesce(a.monthly_interest[3], 0))::text AS mi3, sum(coalesce(a.monthly_interest[4], 0))::text AS mi4, sum(coalesce(a.monthly_interest[5], 0))::text AS mi5, sum(coalesce(a.monthly_interest[6], 0))::text AS mi6, sum(coalesce(a.monthly_interest[7], 0))::text AS mi7, sum(coalesce(a.monthly_interest[8], 0))::text AS mi8, sum(coalesce(a.monthly_interest[9], 0))::text AS mi9, sum(coalesce(a.monthly_interest[10], 0))::text AS mi10, sum(coalesce(a.monthly_interest[11], 0))::text AS mi11, sum(coalesce(a.monthly_interest[12], 0))::text AS mi12,
        sum(coalesce(a.monthly_depreciation[1], 0))::text AS md1, sum(coalesce(a.monthly_depreciation[2], 0))::text AS md2, sum(coalesce(a.monthly_depreciation[3], 0))::text AS md3, sum(coalesce(a.monthly_depreciation[4], 0))::text AS md4, sum(coalesce(a.monthly_depreciation[5], 0))::text AS md5, sum(coalesce(a.monthly_depreciation[6], 0))::text AS md6, sum(coalesce(a.monthly_depreciation[7], 0))::text AS md7, sum(coalesce(a.monthly_depreciation[8], 0))::text AS md8, sum(coalesce(a.monthly_depreciation[9], 0))::text AS md9, sum(coalesce(a.monthly_depreciation[10], 0))::text AS md10, sum(coalesce(a.monthly_depreciation[11], 0))::text AS md11, sum(coalesce(a.monthly_depreciation[12], 0))::text AS md12,
        sum(coalesce(a.monthly_cost[1], 0))::text AS mc1, sum(coalesce(a.monthly_cost[2], 0))::text AS mc2, sum(coalesce(a.monthly_cost[3], 0))::text AS mc3, sum(coalesce(a.monthly_cost[4], 0))::text AS mc4, sum(coalesce(a.monthly_cost[5], 0))::text AS mc5, sum(coalesce(a.monthly_cost[6], 0))::text AS mc6, sum(coalesce(a.monthly_cost[7], 0))::text AS mc7, sum(coalesce(a.monthly_cost[8], 0))::text AS mc8, sum(coalesce(a.monthly_cost[9], 0))::text AS mc9, sum(coalesce(a.monthly_cost[10], 0))::text AS mc10, sum(coalesce(a.monthly_cost[11], 0))::text AS mc11, sum(coalesce(a.monthly_cost[12], 0))::text AS mc12
      FROM v_lease l JOIN lease_accounting a ON a.lease_row_id = l.id
      WHERE ${LIVE}
      GROUP BY 1, 2, 3`.execute(ctx.tx),
    // Ranked in dollars, which orders them as the reporting currency would.
    sql<{ lease_id: string; reference: string; property_name: string; city: string; currency: string; liability: string }>`
      SELECT l.lease_id, l.reference, l.property_name, l.city, a.currency, a.liability::text AS liability
      FROM v_lease l JOIN lease_accounting a ON a.lease_row_id = l.id
      LEFT JOIN LATERAL (SELECT per_usd FROM fx_rate f WHERE f.currency = a.currency ORDER BY on_date DESC LIMIT 1) r ON true
      WHERE ${LIVE}
      ORDER BY a.liability / coalesce(r.per_usd, 1) DESC, l.lease_id
      LIMIT 10`.execute(ctx.tx),
  ]);
  const months = (g: GroupRow, prefix: 'mi' | 'md' | 'mc') => Array.from({ length: 12 }, (_, i) => Number(g[`${prefix}${i + 1}` as keyof GroupRow] ?? 0));
  for (const g of groups.rows) {
    add(g.country_code, g.currency, g.measured_as, g.n, {
      liability: Number(g.liability), rou: Number(g.rou), interest: Number(g.interest), depreciation: Number(g.depreciation),
      leaseCost: Number(g.lease_cost), cash: Number(g.cash),
      bands: Object.fromEntries(BAND_KEYS.map((k) => [k, Number(g[BAND_COLUMNS[k]])])),
      open: Number(g.open), additions: Number(g.additions), interestYtd: Number(g.interest_ytd), payments: Number(g.payments),
      remeasure: Number(g.remeasure), close: Number(g.close),
      monthlyInterest: months(g, 'mi'), monthlyDepreciation: months(g, 'md'), monthlyCost: months(g, 'mc'),
    });
  }
  for (const l of largest.rows) {
    const local = Number(l.liability);
    totals.leases.push({ leaseId: l.lease_id, reference: l.reference, property: l.property_name, city: l.city, liability: fx(local, l.currency), local, currency: l.currency });
  }
  // Leases with no stored figures (changed or added in the person's session): measured live.
  const live = await ctx.tx.selectFrom('v_lease as l').leftJoin('lease_accounting as a', 'a.lease_row_id', 'l.id')
    .where('l.status', 'in', ['ACTIVE', 'HOLDING_OVER']).where('a.lease_row_id', 'is', null).selectAll('l').limit(500).execute();
  for (const l of live as LeaseRow[]) {
    const s = await compute(ctx, l);
    if (!s) { totals.unmeasured += 1; continue; }
    const at = figuresAt(s.result.schedule, ctx.today);
    const y = yearTotals(s.result.schedule, year);
    const rf = rollForward(s.result.schedule, ctx.today);
    const expensed = s.result.schedule.input.standard === 'ASC842_OPERATING' || l.exemption !== 'NONE';
    const cur = s.result.schedule.currency;
    totals.leases.push({ leaseId: l.lease_id, reference: l.reference, property: l.property_name, city: l.city, liability: fx(Number(at.liability), cur), local: Number(at.liability), currency: cur });
    add(l.country_code, cur, s.result.schedule.input.standard, 1, {
      liability: Number(at.liability), rou: Number(at.rou), interest: Number(y.interest), depreciation: Number(y.depreciation),
      leaseCost: expensed ? Number(y.leaseCost) : 0, cash: Number(y.cashPaid),
      bands: Object.fromEntries(at.maturity.bands.map((b) => [b.key, Number(b.amount)])),
      open: Number(rf.open), additions: Number(rf.additions), interestYtd: Number(rf.interest), payments: Number(rf.payments),
      remeasure: Number(rf.remeasure), close: Number(rf.close),
      monthlyInterest: rf.monthlyInterest.map(Number), monthlyDepreciation: rf.monthlyDepreciation.map(Number), monthlyCost: expensed ? rf.monthlyCost.map(Number) : zeros(),
    });
  }
  totals.leases.sort((a, b) => b.liability - a.liability);
  totals.leases.length = Math.min(totals.leases.length, 10);
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

const CountryLiability = builder.objectRef<{ country: string; liability: number; leases: number; currency: string }>('CountryLiability').implement({
  fields: (t) => ({
    countryCode: t.field({ type: 'CountryCode', resolve: (c) => c.country }),
    leases: t.exposeInt('leases'),
    liability: t.field({ type: Money, resolve: (c) => amount(c.liability, c.currency) }),
  }),
});

const LargestLease = builder.objectRef<{ leaseId: string; reference: string; property: string; city: string; liability: number; local: number; currency: string; reporting: string }>('LeaseLiability').implement({
  fields: (t) => ({
    lease: t.field({ type: Lease, nullable: true, resolve: (l, _a, ctx) => ctx.loaders.lease.load(l.leaseId) }),
    reference: t.exposeString('reference'),
    propertyName: t.exposeString('property'),
    city: t.exposeString('city'),
    liability: t.field({ type: Money, description: 'In the reporting currency.', resolve: (l) => amount(l.liability, l.reporting) }),
    liabilityLocal: t.field({ type: Money, description: 'In the lease currency.', resolve: (l) => amount(l.local, l.currency) }),
  }),
});

const Month = builder.objectRef<{ month: number; interest: number; depreciation: number; cost: number; currency: string }>('AccountingMonth').implement({
  description: 'The lease charge in one month of the year (periods ending in it).',
  fields: (t) => ({
    month: t.exposeInt('month', { description: '1 to 12.' }),
    interest: t.field({ type: Money, resolve: (m) => amount(m.interest, m.currency) }),
    depreciation: t.field({ type: Money, resolve: (m) => amount(m.depreciation, m.currency) }),
    leaseCost: t.field({ type: Money, description: 'Operating and exempt lease expense.', resolve: (m) => amount(m.cost, m.currency) }),
  }),
});

const RollForwardType = builder.objectRef<SummaryShape>('LiabilityRollForward').implement({
  description: 'The lease liability year to date, in whole periods ended by today: opening + additions + interest - payments + remeasurements + FX = closing.',
  fields: (t) => ({
    opening: t.field({ type: Money, resolve: (s) => amount(s.totals.open, s.currency) }),
    additions: t.field({ type: Money, resolve: (s) => amount(s.totals.additions, s.currency) }),
    interest: t.field({ type: Money, resolve: (s) => amount(s.totals.interestYtd, s.currency) }),
    payments: t.field({ type: Money, resolve: (s) => amount(s.totals.payments, s.currency) }),
    remeasurements: t.field({ type: Money, resolve: (s) => amount(s.totals.remeasure, s.currency) }),
    fx: t.field({ type: Money, description: 'Translation difference; nil while the company’s rates are held for the year.', resolve: (s) => amount(0, s.currency) }),
    closing: t.field({ type: Money, resolve: (s) => amount(s.totals.close, s.currency) }),
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
    leaseCostThisYear: t.field({ type: Money, description: 'Expense of ASC 842 operating leases and of short-term or low-value exempt leases; nil for leases on the balance sheet.', resolve: (s) => amount(s.totals.leaseCost, s.currency) }),
    cashThisYear: t.field({ type: Money, resolve: (s) => amount(s.totals.cash, s.currency) }),
    currentLiability: t.field({ type: Money, description: 'Due within a year (undiscounted payments in the first band, capped at the liability).',
      resolve: (s) => amount(Math.min(s.totals.bands.WITHIN_1_YEAR ?? 0, s.totals.liability), s.currency) }),
    maturity: t.field({ type: [PortfolioBand], resolve: (s) => BAND_KEYS.map((k) => ({ key: k, amount: s.totals.bands[k] ?? 0, currency: s.currency })) }),
    rollForward: t.field({ type: RollForwardType, resolve: (s) => s }),
    monthly: t.field({ type: [Month], resolve: (s) => s.totals.monthlyInterest.map((interest, i) => ({ month: i + 1, interest, depreciation: s.totals.monthlyDepreciation[i]!, cost: s.totals.monthlyCost[i]!, currency: s.currency })) }),
    largest: t.field({ type: [LargestLease], resolve: (s) => s.totals.leases.map((l) => ({ ...l, reporting: s.currency })) }),
    byCountry: t.field({ type: [CountryLiability], resolve: (s) => [...s.totals.byCountry.entries()].map(([country, v]) => ({ country, ...v, currency: s.currency })).sort((a, b) => b.liability - a.liability) }),
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
