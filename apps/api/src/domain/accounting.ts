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

// Money in whole minor units (cents, fils, shillings), so totals and the roll-forward add up exactly.
// Schedule figures are fixed-point strings at the currency's minor unit, so this is exact.
const toMinor = (v: string): number => Number(v.replace('.', ''));
function fromMinor(n: number, dp: number): string {
  if (dp === 0) return String(n);
  const neg = n < 0;
  const digits = String(Math.abs(n)).padStart(dp + 1, '0');
  return `${neg ? '-' : ''}${digits.slice(0, -dp)}.${digits.slice(-dp)}`;
}

// The carrying amounts at a date. A signed lease that has not started yet carries nothing: under
// IFRS 16.22 and ASC 842-20-30-1 the liability and the asset are recognised at commencement.
export function figuresAt(schedule: Schedule, date: IsoDate): FiguresAt {
  const start = schedule.input.commencementDate;
  const dp = schedule.minorUnits;
  if (date < start) {
    const zero = fromMinor(0, dp);
    const m = maturityAnalysis(schedule, start);
    return {
      liability: zero, rou: zero,
      maturity: { ...m, asOf: date, bands: m.bands.map((b) => ({ ...b, amount: zero })), totalUndiscounted: zero, futureInterest: zero, carryingAmount: zero, current: zero, nonCurrent: zero },
    };
  }
  const liability = carryingAmount(schedule, date).toFixed(dp);
  const past = schedule.rows.filter((r) => r.endDate < date);
  const rou = past.length ? past[past.length - 1]!.closingRou : schedule.initialRou;
  return { liability, rou, maturity: maturityAnalysis(schedule, date) };
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;

// Spreads a period's charge over the calendar months it covers, by days (interest accrues and an
// asset depreciates with time, not in the month a quarter happens to end). Cumulative rounding keeps
// each period's months adding up to the period's figure exactly. Calls back with (year, month 0-11, share).
function spreadByDays(startDate: string, endDate: string, amount: number, add: (year: number, month: number, share: number) => void) {
  if (amount === 0) return;
  const first = dayNumber(startDate);
  const total = dayNumber(endDate) - first + 1;
  let y = Number(startDate.slice(0, 4)); let m = Number(startDate.slice(5, 7)) - 1;
  let done = 0; let given = 0;
  while (done < total) {
    const monthEnd = Date.UTC(y, m + 1, 1) / DAY_MS;
    const segStart = first + done;
    const days = Math.min(monthEnd - segStart, total - done);
    done += days;
    const upTo = Math.round((amount * done) / total);
    add(y, m, upTo - given);
    given = upTo;
    m += 1; if (m === 12) { m = 0; y += 1; }
  }
}

interface YearCharge { interest: number[]; depreciation: number[]; leaseCost: number[] }
function yearCharge(schedule: Schedule, year: number): YearCharge {
  const c: YearCharge = { interest: Array<number>(12).fill(0), depreciation: Array<number>(12).fill(0), leaseCost: Array<number>(12).fill(0) };
  const from = `${year}-01-01`; const to = `${year}-12-31`;
  for (const r of schedule.rows) {
    if (r.endDate < from || r.startDate > to) continue;
    for (const k of ['interest', 'depreciation', 'leaseCost'] as const) {
      spreadByDays(r.startDate, r.endDate, toMinor(r[k]), (yy, mm, share) => { if (yy === year) c[k][mm]! += share; });
    }
  }
  return c;
}

// A calendar year's charge (interest, depreciation, lease cost), accrued by days, and the cash paid
// in it (by payment date). The same figures as the monthly charge summed over the year.
export function yearTotals(schedule: Schedule, year: number): { interest: string; depreciation: string; leaseCost: string; cashPaid: string } {
  const dp = schedule.minorUnits;
  const c = yearCharge(schedule, year);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const from = `${year}-01-01`; const to = `${year}-12-31`;
  const cash = schedule.rows.reduce((a, r) => (r.paymentDate >= from && r.paymentDate <= to ? a + toMinor(r.cashPaid) : a), 0);
  return { interest: fromMinor(sum(c.interest), dp), depreciation: fromMinor(sum(c.depreciation), dp), leaseCost: fromMinor(sum(c.leaseCost), dp), cashPaid: fromMinor(cash, dp) };
}

export interface RollForward {
  open: string; additions: string; interest: string; payments: string; remeasure: string; close: string;
  monthlyInterest: string[]; monthlyDepreciation: string[]; monthlyCost: string[];
}

// The liability from 1 January to the date: open (at 31 December) + additions (leases commencing in
// the year) + interest (periods ended by the date) - payments (made by the date) + remeasurements
// (changes taking effect by the date) = close, the carrying amount at the date, the same figure as
// the headline liability. It holds exactly, in minor units. The monthly charge is the year's,
// accrued by days (months after the date are a forecast).
export function rollForward(schedule: Schedule, date: IsoDate): RollForward {
  const dp = schedule.minorUnits;
  const year = Number(date.slice(0, 4));
  const from = `${year}-01-01`;
  const yearEnd = `${year - 1}-12-31`;
  const start = schedule.input.commencementDate;
  const carrying = (d: string) => (d < start ? 0 : toMinor(carryingAmount(schedule, d).toFixed(dp)));
  const open = start <= yearEnd ? carrying(yearEnd) : 0;
  const additions = start >= from && start <= date ? toMinor(schedule.initialLiability) : 0;
  let interest = 0; let payments = 0; let remeasure = 0;
  const rows = schedule.rows;
  rows.forEach((r, i) => {
    if (r.endDate >= from && r.endDate <= date) interest += toMinor(r.interest);
    if (r.paymentDate >= from && r.paymentDate <= date) payments += toMinor(r.payment);
    if (i > 0 && r.startDate >= from && r.startDate <= date) remeasure += toMinor(r.openingLiability) - toMinor(rows[i - 1]!.closingLiability);
  });
  const close = carrying(date);
  const c = yearCharge(schedule, year);
  const f = (n: number) => fromMinor(n, dp);
  return { open: f(open), additions: f(additions), interest: f(interest), payments: f(payments), remeasure: f(remeasure), close: f(close),
    monthlyInterest: c.interest.map(f), monthlyDepreciation: c.depreciation.map(f), monthlyCost: c.leaseCost.map(f) };
}
