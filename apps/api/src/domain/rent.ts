import Decimal from 'decimal.js';
import { addDays, addMonths, monthsBetween, type IsoDate } from './dates.ts';
import type { EscalationKind, PaymentFrequency, PaymentTiming } from '../db/types.ts';

export const MONTHS_PER_PERIOD: Record<PaymentFrequency, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };
export const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };

export interface RentTerms {
  commencementDate: IsoDate;
  expiryDate: IsoDate;
  frequency: PaymentFrequency;
  timing: PaymentTiming;
  rentPerPeriod: string;
  escalations: { kind: EscalationKind; rate: string | null; everyMonths: number; firstReviewOn: IsoDate; cap: string | null; collar: string | null }[];
  steps: { startsOn: IsoDate; rentPerPeriod: string }[];
}

export interface RentPeriod {
  index: number;
  start: IsoDate;
  end: IsoDate;
  dueOn: IsoDate;
  rent: Decimal;
  // Why the rent changed at this period, if it did.
  change: 'FIXED_UPLIFT' | 'STEP' | null;
}

// Rent in force on a date. Fixed uplifts compound on each review date. Recorded steps (CPI and
// market reviews already settled) replace the rent from their start date; a later fixed uplift
// compounds on top of the latest step. Unknown future index or market changes are not forecast,
// which is also how IFRS 16 measures variable payments (at the index known today).
export function rentOn(terms: RentTerms, on: IsoDate): { rent: Decimal; change: RentPeriod['change'] } {
  const step = [...terms.steps].filter((s) => s.startsOn <= on).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
  let rent = new Decimal(step ? step.rentPerPeriod : terms.rentPerPeriod);
  const baseFrom = step ? step.startsOn : terms.commencementDate;
  for (const e of terms.escalations) {
    if (e.kind !== 'FIXED' || !e.rate) continue;
    if (on < e.firstReviewOn) continue;
    const reviewsToDate = Math.floor(monthsBetween(e.firstReviewOn, on) / e.everyMonths) + 1;
    const reviewsBeforeBase = baseFrom < e.firstReviewOn ? 0 : Math.floor(monthsBetween(e.firstReviewOn, baseFrom) / e.everyMonths) + 1;
    const n = reviewsToDate - reviewsBeforeBase;
    if (n > 0) rent = rent.mul(new Decimal(1).plus(e.rate).pow(n));
  }
  return { rent, change: null };
}

export function rentSchedule(terms: RentTerms, minorUnits: number): RentPeriod[] {
  const months = MONTHS_PER_PERIOD[terms.frequency];
  const periods: RentPeriod[] = [];
  let previous: Decimal | null = null;
  for (let i = 0; ; i++) {
    const start = addMonths(terms.commencementDate, i * months);
    if (start > terms.expiryDate) break;
    const nextStart = addMonths(terms.commencementDate, (i + 1) * months);
    const end = addDays(nextStart, -1) > terms.expiryDate ? terms.expiryDate : addDays(nextStart, -1);
    const { rent } = rentOn(terms, start);
    const rounded = rent.toDecimalPlaces(minorUnits, Decimal.ROUND_HALF_UP);
    const stepHere = terms.steps.some((s) => s.startsOn > (periods.at(-1)?.start ?? '0000') && s.startsOn <= start);
    const change: RentPeriod['change'] =
      previous && !rounded.eq(previous) ? (stepHere ? 'STEP' : 'FIXED_UPLIFT') : null;
    periods.push({ index: i + 1, start, end, dueOn: terms.timing === 'ADVANCE' ? start : end, rent: rounded, change });
    previous = rounded;
  }
  return periods;
}

// Rent is invoiced per period in whole minor units, so annualise the rounded period rent.
export function annualRent(terms: RentTerms, on: IsoDate, minorUnits: number): Decimal {
  const effective = on < terms.commencementDate ? terms.commencementDate : on > terms.expiryDate ? terms.expiryDate : on;
  return rentOn(terms, effective).rent.toDecimalPlaces(minorUnits, Decimal.ROUND_HALF_UP).mul(PERIODS_PER_YEAR[terms.frequency]);
}

export function nextReviewOn(terms: RentTerms, after: IsoDate): IsoDate | null {
  let best: IsoDate | null = null;
  for (const e of terms.escalations) {
    let d = e.firstReviewOn;
    while (d <= after) d = addMonths(d, e.everyMonths);
    if (d <= terms.expiryDate && (best === null || d < best)) best = d;
  }
  return best;
}
