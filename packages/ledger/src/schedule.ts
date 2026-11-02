import { assertIsoDate } from './dates.js';
import { type Dec, dec, fmt, minorUnits, roundMoney, sum, ZERO } from './decimal.js';
import { type PeriodCalendar, periodDates, periodRate, presentValue, type RawRow, runSegment } from './engine.js';
import { LedgerError } from './errors.js';
import { assertTerm, extraStream, nonNegative, periodsPerYear, rentStream } from './payments.js';
import type { CommencementAmounts, LeaseAccountingInput, RemeasurementEvent, Schedule, ScheduleRow } from './types.js';

export function buildSchedule(input: LeaseAccountingInput): Schedule {
  const dp = minorUnits(input.currency);
  assertIsoDate(input.commencementDate);
  assertTerm(input.termPeriods);
  const perYear = periodsPerYear(input.frequency);
  const n = input.termPeriods;

  const rent = rentStream(input.rent, n, perYear, dp);
  const extra = extraStream(input.additionalPayments, n, dp);
  const cash = rent.map((r, i) => r.plus(extra[i] ?? ZERO));

  const annualRate = dec(input.annualDiscountRate, 'annualDiscountRate');
  if (annualRate.isNegative() || annualRate.greaterThanOrEqualTo(1)) {
    throw new LedgerError('INVALID_INPUT', 'annualDiscountRate must be at least 0 and below 1 (e.g. "0.065" for 6.5%)');
  }
  const rate = periodRate(annualRate, perYear);
  const calendar = calendarFor(input);

  const money = (v: LeaseAccountingInput['initialDirectCosts'], field: string): Dec =>
    v === undefined ? ZERO : roundMoney(nonNegative(v, field), dp);
  const initialDirectCosts = money(input.initialDirectCosts, 'initialDirectCosts');
  const incentives = money(input.incentivesReceived, 'incentivesReceived');
  const prepayments = money(input.prepayments, 'prepayments');
  const restoration = money(input.restorationProvision, 'restorationProvision');

  const basisBase = {
    rent: rent.map((v) => fmt(v, dp)),
    extra: extra.map((v) => fmt(v, dp)),
    annualDiscountRate: annualRate.toString(),
    periodRate: rate.toString(),
    termPeriods: n,
  };

  if ((input.exemption ?? 'NONE') !== 'NONE') {
    if (!initialDirectCosts.isZero() || !incentives.isZero() || !prepayments.isZero() || !restoration.isZero()) {
      throw new LedgerError(
        'INVALID_INPUT',
        'Short-term and low-value leases are expensed; initial direct costs, incentives, prepayments and restoration are not supported on them',
      );
    }
    return assemble({
      input, dp, perYear,
      rows: exemptRows(calendar, cash, dp),
      initialLiability: ZERO, initialRou: ZERO,
      commencement: commencementAmounts(ZERO, ZERO, ZERO, ZERO, ZERO, ZERO, dp),
      basis: { ...basisBase, depreciationEndPeriod: n },
      events: [], notes: [],
    });
  }

  const advance = input.timing === 'ADVANCE';
  const initialLiability = roundMoney(presentValue(cash, 1, rate, input.timing, advance), dp);
  const commencementPayment = advance ? (cash[0] ?? ZERO) : ZERO;

  const notes: string[] = [];
  let restorationInRou = restoration;
  if (input.standard !== 'IFRS16' && !restoration.isZero()) {
    restorationInRou = ZERO;
    notes.push(
      `Restoration provision of ${fmt(restoration, dp)} ${input.currency} is an asset retirement obligation under ASC 410-20 and sits outside the lease schedule.`,
    );
  }

  const initialRou = initialLiability
    .plus(commencementPayment)
    .plus(initialDirectCosts)
    .plus(prepayments)
    .plus(restorationInRou)
    .minus(incentives);
  if (initialRou.isNegative()) {
    throw new LedgerError('INVALID_INPUT', 'Incentives received exceed the right-of-use asset before incentives');
  }

  const depreciationEndPeriod = depreciationEnd(input, n);
  const rows = runSegment({
    calendar,
    standard: input.standard,
    segment: 0,
    startPeriod: 1,
    termPeriods: n,
    depreciationEndPeriod,
    cash,
    periodRate: rate,
    openingLiability: initialLiability,
    openingRou: initialRou,
    skipPaymentAtStart: advance,
    dp,
  });

  return assemble({
    input, dp, perYear, rows,
    initialLiability, initialRou,
    commencement: commencementAmounts(
      initialLiability, commencementPayment, initialDirectCosts, prepayments, restorationInRou, incentives, dp,
    ),
    basis: { ...basisBase, depreciationEndPeriod },
    events: [], notes,
  });
}

function commencementAmounts(
  liability: Dec,
  commencementPayment: Dec,
  initialDirectCosts: Dec,
  prepayments: Dec,
  restoration: Dec,
  incentives: Dec,
  dp: number,
): CommencementAmounts {
  return {
    liability: fmt(liability, dp),
    commencementPayment: fmt(commencementPayment, dp),
    initialDirectCosts: fmt(initialDirectCosts, dp),
    prepayments: fmt(prepayments, dp),
    restoration: fmt(restoration, dp),
    incentives: fmt(incentives, dp),
  };
}

export function calendarFor(input: LeaseAccountingInput): PeriodCalendar {
  return {
    commencementDate: input.commencementDate,
    monthsPerPeriod: 12 / periodsPerYear(input.frequency),
    timing: input.timing,
  };
}

export function depreciationEnd(
  input: Pick<LeaseAccountingInput, 'standard' | 'usefulLifePeriods' | 'transfersOwnership'>,
  termPeriods: number,
): number {
  if (input.standard === 'ASC842_OPERATING') return termPeriods;
  const life = input.usefulLifePeriods;
  if (life !== undefined && (!Number.isInteger(life) || life < 1)) {
    throw new LedgerError('INVALID_INPUT', 'usefulLifePeriods must be a positive whole number');
  }
  // IFRS 16.32 / ASC 842-20-35-8: over the useful life if ownership transfers, otherwise the shorter of life and term.
  if (input.transfersOwnership) {
    if (life === undefined) {
      throw new LedgerError('INVALID_INPUT', 'usefulLifePeriods is required when ownership transfers');
    }
    return life;
  }
  return life === undefined ? termPeriods : Math.min(termPeriods, life);
}

function exemptRows(calendar: PeriodCalendar, cash: readonly Dec[], dp: number): RawRow[] {
  const n = cash.length;
  const total = sum(cash);
  const each = roundMoney(total.div(n), dp);
  let recognised = ZERO;
  return cash.map((paid, i) => {
    const period = i + 1;
    const leaseCost = period === n ? total.minus(recognised) : each;
    recognised = recognised.plus(leaseCost);
    return {
      period,
      ...periodDates(calendar, period),
      openingLiability: ZERO,
      payment: ZERO,
      interest: ZERO,
      closingLiability: ZERO,
      openingRou: ZERO,
      depreciation: ZERO,
      closingRou: ZERO,
      leaseCost,
      cashPaid: paid,
      segment: 0,
    };
  });
}

interface AssembleArgs {
  input: LeaseAccountingInput;
  dp: number;
  perYear: number;
  rows: RawRow[];
  initialLiability: Dec;
  initialRou: Dec;
  commencement: CommencementAmounts;
  basis: Schedule['basis'];
  events: RemeasurementEvent[];
  notes: string[];
}

export function assemble(a: AssembleArgs): Schedule {
  const { dp } = a;
  const totals = { payments: ZERO, cashPaid: ZERO, interest: ZERO, depreciation: ZERO, leaseCost: ZERO };
  const rows: ScheduleRow[] = a.rows.map((r) => {
    totals.payments = totals.payments.plus(r.payment);
    totals.cashPaid = totals.cashPaid.plus(r.cashPaid);
    totals.interest = totals.interest.plus(r.interest);
    totals.depreciation = totals.depreciation.plus(r.depreciation);
    totals.leaseCost = totals.leaseCost.plus(r.leaseCost);
    return toRow(r, dp);
  });
  return {
    input: a.input,
    currency: a.input.currency,
    minorUnits: dp,
    periodsPerYear: a.perYear,
    initialLiability: fmt(a.initialLiability, dp),
    initialRou: fmt(a.initialRou, dp),
    commencementPayment: a.commencement.commencementPayment,
    commencement: a.commencement,
    rows,
    totals: {
      payments: fmt(totals.payments, dp),
      cashPaid: fmt(totals.cashPaid, dp),
      interest: fmt(totals.interest, dp),
      depreciation: fmt(totals.depreciation, dp),
      leaseCost: fmt(totals.leaseCost, dp),
    },
    basis: a.basis,
    events: a.events,
    notes: a.notes,
  };
}

function toRow(r: RawRow, dp: number): ScheduleRow {
  return {
    period: r.period,
    startDate: r.startDate,
    endDate: r.endDate,
    paymentDate: r.paymentDate,
    openingLiability: fmt(r.openingLiability, dp),
    payment: fmt(r.payment, dp),
    interest: fmt(r.interest, dp),
    closingLiability: fmt(r.closingLiability, dp),
    openingRou: fmt(r.openingRou, dp),
    depreciation: fmt(r.depreciation, dp),
    closingRou: fmt(r.closingRou, dp),
    leaseCost: fmt(r.leaseCost, dp),
    cashPaid: fmt(r.cashPaid, dp),
    segment: r.segment,
  };
}
