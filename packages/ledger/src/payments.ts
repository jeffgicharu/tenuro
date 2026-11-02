import { type Dec, D, dec, roundMoney, ZERO } from './decimal.ts';
import { LedgerError } from './errors.ts';
import type { AdditionalPayment, Frequency, RentSpec } from './types.ts';

export function periodsPerYear(frequency: Frequency): number {
  switch (frequency) {
    case 'MONTHLY':
      return 12;
    case 'QUARTERLY':
      return 4;
    case 'ANNUAL':
      return 1;
  }
}

/** Rent due in each period of the term, rounded to the minor unit. Index 0 is period 1. */
export function rentStream(rent: RentSpec, termPeriods: number, perYear: number, dp: number): Dec[] {
  assertTerm(termPeriods);
  const out: Dec[] = [];
  switch (rent.kind) {
    case 'FIXED':
    case 'INDEXED': {
      const amount = roundMoney(nonNegative(rent.amount, 'rent.amount'), dp);
      for (let t = 1; t <= termPeriods; t++) out.push(amount);
      return out;
    }
    case 'FIXED_ESCALATION': {
      const base = nonNegative(rent.amount, 'rent.amount');
      const growth = new D(1).plus(dec(rent.annualRate, 'rent.annualRate'));
      const every = rent.upliftEveryPeriods ?? perYear;
      if (!Number.isInteger(every) || every < 1) {
        throw new LedgerError('INVALID_INPUT', 'rent.upliftEveryPeriods must be a positive integer');
      }
      for (let t = 1; t <= termPeriods; t++) {
        const uplifts = Math.floor((t - 1) / every);
        out.push(roundMoney(base.times(growth.pow(uplifts)), dp));
      }
      return out;
    }
    case 'STEPPED': {
      const steps = [...rent.steps].sort((a, b) => a.fromPeriod - b.fromPeriod);
      if (steps[0]?.fromPeriod !== 1) {
        throw new LedgerError('INVALID_INPUT', 'The first rent step must start at period 1');
      }
      let i = 0;
      for (let t = 1; t <= termPeriods; t++) {
        while (i + 1 < steps.length && (steps[i + 1]?.fromPeriod ?? Infinity) <= t) i++;
        const step = steps[i];
        if (!step) throw new LedgerError('INVALID_INPUT', 'Invalid rent steps');
        out.push(roundMoney(nonNegative(step.amount, 'rent.steps.amount'), dp));
      }
      return out;
    }
    case 'EXPLICIT': {
      if (rent.payments.length !== termPeriods) {
        throw new LedgerError(
          'INVALID_INPUT',
          `rent.payments has ${rent.payments.length} entries but the term is ${termPeriods} periods`,
        );
      }
      return rent.payments.map((p, i) => roundMoney(nonNegative(p, `rent.payments[${i}]`), dp));
    }
  }
}

export function extraStream(
  additional: readonly AdditionalPayment[] | undefined,
  termPeriods: number,
  dp: number,
): Dec[] {
  const out: Dec[] = Array.from({ length: termPeriods }, () => ZERO);
  for (const payment of additional ?? []) {
    if (!Number.isInteger(payment.period) || payment.period < 1 || payment.period > termPeriods) {
      throw new LedgerError('INVALID_INPUT', `Additional payment period ${payment.period} is outside the term`);
    }
    const index = payment.period - 1;
    out[index] = (out[index] ?? ZERO).plus(roundMoney(nonNegative(payment.amount, 'additionalPayments.amount'), dp));
  }
  return out;
}

export interface TermOption {
  kind: 'RENEWAL' | 'BREAK';
  /** RENEWAL: months added if taken. */
  months?: number;
  /** BREAK: month from commencement at which the lease can be ended. */
  exercisableAtMonth?: number;
  /** RENEWAL: reasonably certain to be exercised. BREAK: reasonably certain to be exercised (ending the lease early). */
  reasonablyCertain: boolean;
}

export interface TermAssessment {
  /** Months to contractual expiry, ignoring break options. */
  contractualMonths: number;
  frequency: Frequency;
  options?: readonly TermOption[];
}

export interface EffectiveTerm {
  termMonths: number;
  termPeriods: number;
  endedByBreakAtMonth: number | null;
  renewalMonthsIncluded: number;
}

/**
 * The lease term under IFRS 16.18–19 and ASC 842-10-30-1: the non-cancellable period, plus periods
 * covered by renewal options reasonably certain to be exercised, and stopping at the first break the
 * lessee is reasonably certain to exercise. Renewals only count once every earlier renewal counts.
 */
export function effectiveTerm(assessment: TermAssessment): EffectiveTerm {
  const { contractualMonths, frequency } = assessment;
  if (!Number.isInteger(contractualMonths) || contractualMonths < 1) {
    throw new LedgerError('INVALID_TERM', 'contractualMonths must be a positive whole number');
  }
  const options = assessment.options ?? [];
  const breaks = options
    .filter((o) => o.kind === 'BREAK' && o.reasonablyCertain)
    .map((o) => o.exercisableAtMonth ?? NaN);
  if (breaks.some((m) => !Number.isInteger(m) || m < 1 || m > contractualMonths)) {
    throw new LedgerError('INVALID_TERM', 'A break must fall within the contractual term');
  }
  const firstBreak = breaks.length ? Math.min(...breaks) : null;

  let termMonths = firstBreak ?? contractualMonths;
  let renewalMonthsIncluded = 0;
  if (firstBreak === null) {
    for (const option of options.filter((o) => o.kind === 'RENEWAL')) {
      if (!option.reasonablyCertain) break;
      const months = option.months ?? NaN;
      if (!Number.isInteger(months) || months < 1) {
        throw new LedgerError('INVALID_TERM', 'A renewal must add a positive whole number of months');
      }
      renewalMonthsIncluded += months;
    }
    termMonths += renewalMonthsIncluded;
  }

  const monthsPerPeriod = 12 / periodsPerYear(frequency);
  if (termMonths % monthsPerPeriod !== 0) {
    throw new LedgerError('INVALID_TERM', `A ${termMonths}-month term is not a whole number of ${frequency.toLowerCase()} periods`);
  }
  return { termMonths, termPeriods: termMonths / monthsPerPeriod, endedByBreakAtMonth: firstBreak, renewalMonthsIncluded };
}

export function assertTerm(termPeriods: number): void {
  if (!Number.isInteger(termPeriods) || termPeriods < 1 || termPeriods > 1200) {
    throw new LedgerError('INVALID_TERM', 'The term must be between 1 and 1200 periods');
  }
}

export function nonNegative(value: Parameters<typeof dec>[0], field: string): Dec {
  const d = dec(value, field);
  if (d.isNegative()) throw new LedgerError('INVALID_INPUT', `${field} cannot be negative`);
  return d;
}
