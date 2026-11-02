import { buildSchedule, carryingAmount, maturityAnalysis, remeasureSeries, type LeaseAccountingInput, type LeaseChange, type MaturityAnalysis, type Remeasurement, type Schedule } from '@tenuro/ledger';
import { addDays, monthsBetween, type IsoDate } from './dates.ts';

// Turns a stored lease into its IFRS 16 / ASC 842 accounting: the schedule measured at commencement,
// with each later rent change (an index or market review) applied as a remeasurement at the
// unchanged discount rate (IFRS 16.42(b); ASC 842-10-35-4), and the figures at a date. Pure, so the
// seed can store the figures it computes and the API can compute a person's changed leases live.

export interface AccountingLease {
  commencement_date: IsoDate;
  expiry_date: IsoDate;
  currency: string;
  payment_frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  payment_timing: 'ADVANCE' | 'ARREARS';
  rent_per_period: string | number;
  discount_rate: string | number;
  initial_direct_costs: string | number | null;
  incentives: string | number | null;
  prepayments: string | number | null;
  restoration_cost: string | number | null;
  useful_life_months: number | null;
  ownership_transfers: boolean | null;
  standard: 'IFRS16' | 'ASC842';
  asc842_class: 'FINANCE' | 'OPERATING' | null;
  exemption: 'NONE' | 'SHORT_TERM' | 'LOW_VALUE';
}

export interface AccountingStep { starts_on: IsoDate; rent_per_period: string | number }
export interface AccountingEscalation { kind: 'FIXED' | 'CPI' | 'MARKET_REVIEW' | 'NONE'; rate: string | number | null; every_months: number }

const MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 } as const;

export interface LeaseAccountingResult {
  schedule: Schedule;
  remeasurements: Remeasurement[];
}

export function accountingInput(l: AccountingLease, escalations: readonly AccountingEscalation[]): LeaseAccountingInput {
  const per = MONTHS[l.payment_frequency];
  const months = Math.max(per, monthsBetween(l.commencement_date, addDays(l.expiry_date, 1)));
  const termPeriods = Math.max(1, Math.round(months / per));
  const fixed = escalations.find((e) => e.kind === 'FIXED' && e.rate !== null);
  const indexed = escalations.some((e) => e.kind === 'CPI' || e.kind === 'MARKET_REVIEW');
  const amount = String(l.rent_per_period);
  const rent: LeaseAccountingInput['rent'] = fixed
    ? { kind: 'FIXED_ESCALATION', amount, annualRate: String(fixed.rate), upliftEveryPeriods: Math.max(1, Math.round(fixed.every_months / per)) }
    : indexed ? { kind: 'INDEXED', amount } : { kind: 'FIXED', amount };
  const standard = l.standard === 'IFRS16' ? 'IFRS16' : l.asc842_class === 'FINANCE' ? 'ASC842_FINANCE' : 'ASC842_OPERATING';
  return {
    currency: l.currency,
    commencementDate: l.commencement_date,
    frequency: l.payment_frequency,
    timing: l.payment_timing,
    termPeriods,
    rent,
    annualDiscountRate: String(l.discount_rate),
    initialDirectCosts: String(l.initial_direct_costs ?? 0),
    incentivesReceived: String(l.incentives ?? 0),
    prepayments: String(l.prepayments ?? 0),
    restorationProvision: String(l.restoration_cost ?? 0),
    ...(l.useful_life_months ? { usefulLifePeriods: Math.max(1, Math.round(l.useful_life_months / per)) } : {}),
    transfersOwnership: Boolean(l.ownership_transfers),
    standard,
    exemption: l.exemption,
  };
}

// Index and market-review steps up to `asOf` become remeasurements, in order. A FIXED escalation is
// already in the schedule, so its steps are not applied again.
export function leaseAccounting(l: AccountingLease, steps: readonly AccountingStep[], escalations: readonly AccountingEscalation[], asOf: IsoDate): LeaseAccountingResult {
  const input = accountingInput(l, escalations);
  const schedule = buildSchedule(input);
  if (input.rent.kind !== 'INDEXED') return { schedule, remeasurements: [] };
  const changes: { change: LeaseChange; effectiveDate: string }[] = [];
  let previous = String(l.rent_per_period);
  for (const s of [...steps].sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))) {
    if (s.starts_on > asOf || s.starts_on <= l.commencement_date || s.starts_on > l.expiry_date) continue;
    const next = String(s.rent_per_period);
    if (next === previous) continue;
    changes.push({ change: { kind: 'INDEX_CHANGE', previousIndex: previous, newIndex: next }, effectiveDate: s.starts_on });
    previous = next;
  }
  // Applied as one series: the same figures as one remeasurement after another, at a fraction of the work.
  return remeasureSeries(schedule, changes);
}

export interface FiguresAt {
  liability: string;
  rou: string;
  maturity: MaturityAnalysis;
}

// The carrying amounts at a date. Before commencement (a signed lease not yet started) the figures
// are those at commencement, with every payment still ahead.
export function figuresAt(schedule: Schedule, date: IsoDate): FiguresAt {
  const start = schedule.input.commencementDate;
  if (date < start) {
    return { liability: schedule.initialLiability, rou: schedule.initialRou, maturity: maturityAnalysis(schedule, start) };
  }
  const liability = carryingAmount(schedule, date).toFixed(schedule.minorUnits);
  const past = schedule.rows.filter((r) => r.endDate < date);
  const rou = past.length ? past[past.length - 1]!.closingRou : schedule.initialRou;
  return { liability, rou, maturity: maturityAnalysis(schedule, date) };
}

// Totals for the rows whose period ends within a calendar year (interest, depreciation, lease cost).
export function yearTotals(schedule: Schedule, year: number): { interest: string; depreciation: string; leaseCost: string; cashPaid: string } {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  let interest = 0; let depreciation = 0; let leaseCost = 0; let cashPaid = 0;
  for (const r of schedule.rows) {
    if (r.endDate < from || r.endDate > to) continue;
    interest += Number(r.interest); depreciation += Number(r.depreciation); leaseCost += Number(r.leaseCost); cashPaid += Number(r.cashPaid);
  }
  const dp = schedule.minorUnits;
  return { interest: interest.toFixed(dp), depreciation: depreciation.toFixed(dp), leaseCost: leaseCost.toFixed(dp), cashPaid: cashPaid.toFixed(dp) };
}

export interface RollForward {
  open: string; additions: string; interest: string; payments: string; remeasure: string; close: string;
  monthlyInterest: string[]; monthlyDepreciation: string[]; monthlyCost: string[];
}

// The year to date in whole periods: every row whose period ends between 1 January and the date.
// Row by row, closing = opening + interest - payment, and a jump between one row's closing and the
// next row's opening is a remeasurement, so open + additions + interest - payments + remeasure =
// close exactly. A lease commencing this year opens at nothing and adds its first opening balance.
// The monthly charge puts each row's interest, depreciation and lease cost in the month its period ends.
export function rollForward(schedule: Schedule, date: IsoDate): RollForward {
  const year = date.slice(0, 4);
  const from = `${year}-01-01`;
  const dp = schedule.minorUnits;
  const rows = schedule.rows;
  const inYear = rows.filter((r) => r.endDate >= from && r.endDate <= date);
  const mi = Array<number>(12).fill(0); const md = Array<number>(12).fill(0); const mc = Array<number>(12).fill(0);
  let interest = 0; let payments = 0; let remeasure = 0; let additions = 0; let open = 0; let close = 0;
  if (inYear.length) {
    const first = inYear[0]!;
    const idx = rows.indexOf(first);
    if (idx === 0) additions = Number(first.openingLiability);
    else open = Number(rows[idx - 1]!.closingLiability);
    let prevClose = idx === 0 ? Number(first.openingLiability) : open;
    for (const r of inYear) {
      remeasure += Number(r.openingLiability) - prevClose;
      interest += Number(r.interest); payments += Number(r.payment);
      prevClose = Number(r.closingLiability);
    }
    close = prevClose;
  } else {
    // No period has ended this year yet: the liability stands where the last period left it.
    const before = rows.filter((r) => r.endDate < from);
    open = before.length ? Number(before[before.length - 1]!.closingLiability) : 0;
    close = open;
  }
  for (const r of rows) {
    if (!r.endDate.startsWith(year)) continue;
    const m = Number(r.endDate.slice(5, 7)) - 1;
    mi[m]! += Number(r.interest); md[m]! += Number(r.depreciation); mc[m]! += Number(r.leaseCost);
  }
  const f = (n: number) => n.toFixed(dp);
  return { open: f(open), additions: f(additions), interest: f(interest), payments: f(payments), remeasure: f(remeasure), close: f(close),
    monthlyInterest: mi.map(f), monthlyDepreciation: md.map(f), monthlyCost: mc.map(f) };
}
