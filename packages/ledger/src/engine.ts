import { addDays, addMonths } from './dates.ts';
import { type Dec, D, ONE, roundMoney, sum, ZERO } from './decimal.ts';
import type { AccountingStandard, PaymentTiming, ScheduleRow } from './types.ts';

/** A schedule row with exact decimals; converted to strings at the API boundary. */
export interface RawRow {
  period: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  openingLiability: Dec;
  payment: Dec;
  interest: Dec;
  closingLiability: Dec;
  openingRou: Dec;
  depreciation: Dec;
  closingRou: Dec;
  leaseCost: Dec;
  cashPaid: Dec;
  segment: number;
}

export interface PeriodCalendar {
  commencementDate: string;
  monthsPerPeriod: number;
  timing: PaymentTiming;
}

export function periodDates(cal: PeriodCalendar, period: number): { startDate: string; endDate: string; paymentDate: string } {
  return datesFrom(cal, period, addMonths(cal.commencementDate, (period - 1) * cal.monthsPerPeriod));
}

/** Dates for a period whose start is already known; the next period's start is `nextStart`. */
function datesFrom(
  cal: PeriodCalendar,
  period: number,
  startDate: string,
): { startDate: string; endDate: string; paymentDate: string; nextStart: string } {
  const nextStart = addMonths(cal.commencementDate, period * cal.monthsPerPeriod);
  const endDate = addDays(nextStart, -1);
  return { startDate, endDate, paymentDate: cal.timing === 'ADVANCE' ? startDate : endDate, nextStart };
}

// Rows as they came out of the engine, kept per schedule so a remeasurement (or the journals) can
// carry on from exact decimals instead of re-reading every formatted row. Rows and decimals are never
// mutated, so sharing them is safe; a schedule built elsewhere (or copied) simply falls back to parsing.
const rawRowsOf = new WeakMap<object, readonly RawRow[]>();

export function rememberRawRows(schedule: object, rows: readonly RawRow[]): void {
  rawRowsOf.set(schedule, rows);
}

export function rawRows(schedule: { rows: readonly ScheduleRow[] }): readonly RawRow[] {
  return rawRowsOf.get(schedule) ?? schedule.rows.map(fromRow);
}

export function fromRow(r: ScheduleRow): RawRow {
  return {
    period: r.period,
    startDate: r.startDate,
    endDate: r.endDate,
    paymentDate: r.paymentDate,
    openingLiability: new D(r.openingLiability),
    payment: new D(r.payment),
    interest: new D(r.interest),
    closingLiability: new D(r.closingLiability),
    openingRou: new D(r.openingRou),
    depreciation: new D(r.depreciation),
    closingRou: new D(r.closingRou),
    leaseCost: new D(r.leaseCost),
    cashPaid: new D(r.cashPaid),
    segment: r.segment,
  };
}

// A fractional power at 34 digits is the dearest step in building a schedule, and a portfolio uses a
// handful of rates, so each (rate, frequency) pair is worked out once. The value is the same either way.
const periodRates = new Map<string, Dec>();

export function periodRate(annualRate: Dec, perYear: number): Dec {
  const key = `${annualRate.toString()}|${perYear}`;
  let rate = periodRates.get(key);
  if (rate === undefined) {
    rate = ONE.plus(annualRate).pow(ONE.div(perYear)).minus(ONE);
    if (periodRates.size > 10_000) periodRates.clear();
    periodRates.set(key, rate);
  }
  return rate;
}

/**
 * Present value at the start of `fromPeriod` of the payments due in periods fromPeriod..n.
 * Advance payments fall at the start of each period, arrears at the end.
 */
export function presentValue(
  cash: readonly Dec[],
  fromPeriod: number,
  rate: Dec,
  timing: PaymentTiming,
  skipFirst: boolean,
): Dec {
  const v = ONE.div(ONE.plus(rate));
  let factor = timing === 'ADVANCE' ? ONE : v;
  let total = ZERO;
  for (let t = fromPeriod; t <= cash.length; t++) {
    if (!(skipFirst && t === fromPeriod)) total = total.plus((cash[t - 1] ?? ZERO).times(factor));
    factor = factor.times(v);
  }
  return total;
}

export interface SegmentParams {
  calendar: PeriodCalendar;
  standard: AccountingStandard;
  segment: number;
  startPeriod: number;
  termPeriods: number;
  depreciationEndPeriod: number;
  /** Rent plus additional payments for each period of the term; index 0 is period 1. */
  cash: readonly Dec[];
  periodRate: Dec;
  /** Rounded liability at the start of `startPeriod`, before that period's payment. */
  openingLiability: Dec;
  /** Rounded ROU carrying amount at the start of `startPeriod`. */
  openingRou: Dec;
  /** True only at commencement of an advance lease: period 1's payment was made at commencement. */
  skipPaymentAtStart: boolean;
  dp: number;
  /** Stop after this period (a later change will rebuild the rest). Rows up to it are unaffected. */
  stopAfterPeriod?: number;
}

/**
 * Runs the liability and the ROU asset forward from `startPeriod`.
 *
 * Interest and depreciation are rounded each period and balances carry forward rounded. The last
 * liability period takes whatever interest brings the liability to exactly zero, and the last
 * depreciation period takes whatever is left of the asset, so rounding never leaves a balance behind.
 */
export function runSegment(p: SegmentParams): RawRow[] {
  const n = p.termPeriods;
  const operating = p.standard === 'ASC842_OPERATING';
  const depEnd = operating ? n : p.depreciationEndPeriod;
  const lastRow = Math.max(n, depEnd);
  const advance = p.calendar.timing === 'ADVANCE';

  const depCount = depEnd - p.startPeriod + 1;
  const depEach = depCount > 0 ? roundMoney(p.openingRou.div(depCount), p.dp) : ZERO;

  let costEach = ZERO;
  if (operating) {
    const liabilityPayments: Dec[] = [];
    for (let t = p.startPeriod; t <= n; t++) {
      if (!(p.skipPaymentAtStart && t === p.startPeriod)) liabilityPayments.push(p.cash[t - 1] ?? ZERO);
    }
    // ASC 842-20-25-6: total cost still to recognise is the remaining payments plus the asset over the liability.
    const remainingCost = sum(liabilityPayments).plus(p.openingRou).minus(p.openingLiability);
    costEach = roundMoney(remainingCost.div(n - p.startPeriod + 1), p.dp);
  }

  const rows: RawRow[] = [];
  let liability = p.openingLiability;
  let rou = p.openingRou;
  let start = addMonths(p.calendar.commencementDate, (p.startPeriod - 1) * p.calendar.monthsPerPeriod);
  const until = Math.min(lastRow, p.stopAfterPeriod ?? lastRow);
  for (let t = p.startPeriod; t <= until; t++) {
    const { nextStart, ...dates } = datesFrom(p.calendar, t, start);
    start = nextStart;
    const inTerm = t <= n;
    const cashDue = inTerm ? (p.cash[t - 1] ?? ZERO) : ZERO;
    const payment = inTerm && !(p.skipPaymentAtStart && t === p.startPeriod) ? cashDue : ZERO;

    let interest = ZERO;
    if (inTerm) {
      if (t === n) {
        interest = payment.minus(liability);
      } else {
        const base = advance ? liability.minus(payment) : liability;
        interest = roundMoney(base.times(p.periodRate), p.dp);
      }
    }
    const closingLiability = liability.minus(payment).plus(interest);

    let depreciation: Dec;
    let leaseCost: Dec;
    if (operating) {
      depreciation = t === n ? rou : costEach.minus(interest);
      leaseCost = t === n ? depreciation.plus(interest) : costEach;
    } else {
      depreciation = t > depEnd ? ZERO : t === depEnd ? rou : D.min(depEach, rou);
      leaseCost = interest.plus(depreciation);
    }
    const closingRou = rou.minus(depreciation);

    rows.push({
      period: t,
      ...dates,
      openingLiability: liability,
      payment,
      interest,
      closingLiability,
      openingRou: rou,
      depreciation,
      closingRou,
      leaseCost,
      cashPaid: cashDue,
      segment: p.segment,
    });
    liability = closingLiability;
    rou = closingRou;
  }
  return rows;
}
