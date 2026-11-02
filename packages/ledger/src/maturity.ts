import { addMonths, assertIsoDate } from './dates.js';
import { type Dec, D, fmt, sum, ZERO } from './decimal.js';
import { LedgerError } from './errors.js';
import type { Money, Schedule } from './types.js';

export type MaturityBandKey = 'WITHIN_1_YEAR' | 'YEAR_1_TO_2' | 'YEAR_2_TO_3' | 'YEAR_3_TO_4' | 'YEAR_4_TO_5' | 'AFTER_5_YEARS';

export interface MaturityBand {
  key: MaturityBandKey;
  label: string;
  /** Undiscounted lease payments falling due in the band. */
  amount: Money;
}

export interface MaturityAnalysis {
  asOf: string;
  currency: string;
  bands: MaturityBand[];
  totalUndiscounted: Money;
  /** Interest still to be charged: the difference between undiscounted payments and the liability. */
  futureInterest: Money;
  /** Carrying amount of the lease liability at `asOf`. */
  carryingAmount: Money;
  /** Portion of the liability expected to be settled within twelve months. */
  current: Money;
  nonCurrent: Money;
}

const BANDS: ReadonlyArray<{ key: MaturityBandKey; label: string; untilYears: number }> = [
  { key: 'WITHIN_1_YEAR', label: 'Within 1 year', untilYears: 1 },
  { key: 'YEAR_1_TO_2', label: '1 to 2 years', untilYears: 2 },
  { key: 'YEAR_2_TO_3', label: '2 to 3 years', untilYears: 3 },
  { key: 'YEAR_3_TO_4', label: '3 to 4 years', untilYears: 4 },
  { key: 'YEAR_4_TO_5', label: '4 to 5 years', untilYears: 5 },
  { key: 'AFTER_5_YEARS', label: 'After 5 years', untilYears: Infinity },
];

/**
 * Maturity analysis of the lease liability for disclosure (IFRS 16.58 with IFRS 7.39 and B11;
 * ASC 842-20-50-6, whose "each of the next five years and thereafter" uses the same bands).
 * A payment due on `asOf` is treated as paid.
 */
export function maturityAnalysis(schedule: Schedule, asOf: string): MaturityAnalysis {
  assertIsoDate(asOf);
  if (asOf < schedule.input.commencementDate) {
    throw new LedgerError('INVALID_INPUT', 'The analysis date cannot be before commencement');
  }
  const dp = schedule.minorUnits;
  const amounts = BANDS.map(() => ZERO as Dec);
  const limits = BANDS.map((b) => (Number.isFinite(b.untilYears) ? addMonths(asOf, 12 * b.untilYears) : null));

  for (const row of schedule.rows) {
    const payment = new D(row.payment);
    if (payment.isZero() || row.paymentDate <= asOf) continue;
    const band = limits.findIndex((limit) => limit === null || row.paymentDate <= limit);
    amounts[band] = (amounts[band] ?? ZERO).plus(payment);
  }

  const carrying = carryingAmount(schedule, asOf);
  const futureInterest = sum(
    schedule.rows.filter((r) => r.endDate > asOf).map((r) => new D(r.interest)),
  );
  const totalUndiscounted = sum(amounts);
  if (!totalUndiscounted.minus(futureInterest).equals(carrying)) {
    throw new Error('Maturity analysis does not reconcile to the carrying amount');
  }
  const inTwelveMonths = carryingAmount(schedule, addMonths(asOf, 12));
  const current = carrying.minus(inTwelveMonths);

  return {
    asOf,
    currency: schedule.currency,
    bands: BANDS.map((b, i) => ({ key: b.key, label: b.label, amount: fmt(amounts[i] ?? ZERO, dp) })),
    totalUndiscounted: fmt(totalUndiscounted, dp),
    futureInterest: fmt(futureInterest, dp),
    carryingAmount: fmt(carrying, dp),
    current: fmt(current, dp),
    nonCurrent: fmt(carrying.minus(current), dp),
  };
}

/**
 * Liability at the end of `date`: interest is recognised for periods that have ended and payments
 * that have fallen due are deducted. Within a period, interest has not yet been charged.
 */
export function carryingAmount(schedule: Schedule, date: string): Dec {
  const row = schedule.rows.find((r) => r.startDate <= date && date <= r.endDate);
  if (!row) {
    const first = schedule.rows[0];
    if (first && date < first.startDate) return new D(schedule.initialLiability);
    return ZERO;
  }
  if (date === row.endDate) return new D(row.closingLiability);
  const opening = new D(row.openingLiability);
  return row.paymentDate <= date ? opening.minus(new D(row.payment)) : opening;
}
