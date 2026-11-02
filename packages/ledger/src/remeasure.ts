import { assertIsoDate } from './dates.js';
import { type Dec, D, dec, fmt, ONE, roundMoney, ZERO } from './decimal.js';
import { fromRow, periodRate, presentValue, runSegment } from './engine.js';
import { LedgerError } from './errors.js';
import { type Posting, remeasurementEntry } from './journals.js';
import { assertTerm, nonNegative } from './payments.js';
import { assemble, buildSchedule, calendarFor, depreciationEnd } from './schedule.js';
import type { LeaseChange, Remeasurement, RemeasurementEvent, Schedule } from './types.js';

const MEMO: Record<LeaseChange['kind'], string> = {
  INDEX_CHANGE: 'Remeasure lease liability for a change in the rent index (unchanged discount rate)',
  RESIDUAL_GUARANTEE_CHANGE: 'Remeasure lease liability for a change in a residual value guarantee (unchanged discount rate)',
  TERM_REASSESSMENT: 'Remeasure lease liability for a reassessed lease term (revised discount rate)',
  PURCHASE_OPTION_REASSESSMENT: 'Remeasure lease liability for a reassessed purchase option (revised discount rate)',
  MODIFICATION_SEPARATE_LEASE: 'Separate lease',
  MODIFICATION_SCOPE_DECREASE: 'Lease modification: decrease in scope, with partial derecognition (revised discount rate)',
  MODIFICATION_OTHER: 'Lease modification (revised discount rate)',
};

/**
 * Applies a reassessment or a modification that takes effect on the first day of a period.
 * Periods before it are left exactly as they were; the remaining periods are rebuilt from the
 * remeasured liability and the adjusted right-of-use asset.
 */
export function remeasure(schedule: Schedule, change: LeaseChange, effectiveDate: string): Remeasurement {
  assertIsoDate(effectiveDate);
  const dp = schedule.minorUnits;

  if (change.kind === 'MODIFICATION_SEPARATE_LEASE') {
    const separateLease = buildSchedule(change.lease);
    const carrying = carryingAtPeriodStart(schedule, effectiveDate);
    return {
      kind: change.kind,
      effectiveDate,
      before: carrying,
      after: carrying,
      adjustments: { liability: fmt(ZERO, dp), rou: fmt(ZERO, dp), profitOrLoss: fmt(ZERO, dp) },
      journal: null,
      schedule,
      separateLease,
    };
  }

  if ((schedule.input.exemption ?? 'NONE') !== 'NONE') {
    throw new LedgerError('UNSUPPORTED_CHANGE', 'Short-term and low-value leases carry no liability to remeasure');
  }

  const { basis, input } = schedule;
  const effectiveRow = schedule.rows.find((r) => r.startDate === effectiveDate);
  if (!effectiveRow || effectiveRow.period < 2 || effectiveRow.period > basis.termPeriods) {
    throw new LedgerError(
      'INVALID_EFFECTIVE_DATE',
      'A remeasurement must take effect on the first day of a period after the first, within the lease term',
    );
  }
  const p = effectiveRow.period;
  const previous = schedule.rows.find((r) => r.period === p - 1);
  if (!previous) throw new LedgerError('INVALID_EFFECTIVE_DATE', 'No period precedes the effective date');

  const liabilityBefore = new D(previous.closingLiability);
  const rouBefore = new D(previous.closingRou);
  let rent = basis.rent.map((v) => new D(v));
  let extra = basis.extra.map((v) => new D(v));
  let annualRate = new D(basis.annualDiscountRate);
  let termPeriods = basis.termPeriods;
  let usefulLifePeriods = input.usefulLifePeriods;
  let transfersOwnership = input.transfersOwnership ?? false;
  let decrease: Dec | null = null;

  const revisedRate = (v: Parameters<typeof dec>[0]): Dec => {
    const r = dec(v, 'revisedAnnualDiscountRate');
    if (r.isNegative() || r.greaterThanOrEqualTo(1)) {
      throw new LedgerError('INVALID_INPUT', 'revisedAnnualDiscountRate must be at least 0 and below 1');
    }
    return r;
  };
  const resize = (newTerm: number, extensionPayment?: Dec): void => {
    assertTerm(newTerm);
    if (newTerm < p) {
      throw new LedgerError('INVALID_TERM', 'The new term must include the period the change takes effect in');
    }
    const last = rent[termPeriods - 1] ?? ZERO;
    const fill = extensionPayment ?? last;
    rent = Array.from({ length: newTerm }, (_, i) => rent[i] ?? fill);
    extra = Array.from({ length: newTerm }, (_, i) => (i < termPeriods ? (extra[i] ?? ZERO) : ZERO));
    termPeriods = newTerm;
  };

  switch (change.kind) {
    case 'INDEX_CHANGE': {
      const previousIndex = dec(change.previousIndex, 'previousIndex');
      const newIndex = nonNegative(change.newIndex, 'newIndex');
      if (!previousIndex.isPositive()) throw new LedgerError('INVALID_INPUT', 'previousIndex must be positive');
      const ratio = newIndex.div(previousIndex);
      rent = rent.map((r, i) => (i + 1 >= p ? roundMoney(r.times(ratio), dp) : r));
      break;
    }
    case 'RESIDUAL_GUARANTEE_CHANGE': {
      if (!Number.isInteger(change.period) || change.period < p || change.period > termPeriods) {
        throw new LedgerError('INVALID_INPUT', 'The guarantee must fall in a remaining period of the term');
      }
      extra = extra.map((x, i) => (i + 1 === change.period ? roundMoney(nonNegative(change.amount, 'amount'), dp) : x));
      break;
    }
    case 'TERM_REASSESSMENT': {
      annualRate = revisedRate(change.revisedAnnualDiscountRate);
      const fill = change.extensionPayment === undefined ? undefined : roundMoney(nonNegative(change.extensionPayment, 'extensionPayment'), dp);
      resize(change.newTermPeriods, fill);
      break;
    }
    case 'PURCHASE_OPTION_REASSESSMENT': {
      annualRate = revisedRate(change.revisedAnnualDiscountRate);
      const price = change.exercisePrice === null ? ZERO : roundMoney(nonNegative(change.exercisePrice, 'exercisePrice'), dp);
      extra = extra.map((x, i) => (i === termPeriods - 1 ? price : x));
      transfersOwnership = change.exercisePrice !== null;
      usefulLifePeriods = change.usefulLifePeriods ?? usefulLifePeriods;
      break;
    }
    case 'MODIFICATION_SCOPE_DECREASE': {
      annualRate = revisedRate(change.revisedAnnualDiscountRate);
      const fraction = dec(change.fraction, 'fraction');
      if (!fraction.isPositive() || fraction.greaterThanOrEqualTo(1)) {
        throw new LedgerError('INVALID_INPUT', 'fraction must be above 0 and below 1');
      }
      decrease = fraction;
      const revised = change.revisedPayment === undefined ? null : roundMoney(nonNegative(change.revisedPayment, 'revisedPayment'), dp);
      rent = rent.map((r, i) => (i + 1 >= p ? (revised ?? roundMoney(r.times(ONE.minus(fraction)), dp)) : r));
      break;
    }
    case 'MODIFICATION_OTHER': {
      annualRate = revisedRate(change.revisedAnnualDiscountRate);
      if (change.newTermPeriods !== undefined) resize(change.newTermPeriods);
      if (change.revisedPayment !== undefined) {
        const revised = roundMoney(nonNegative(change.revisedPayment, 'revisedPayment'), dp);
        rent = rent.map((r, i) => (i + 1 >= p ? revised : r));
      }
      break;
    }
  }

  const perYear = schedule.periodsPerYear;
  const rate = periodRate(annualRate, perYear);
  const cash = rent.map((r, i) => r.plus(extra[i] ?? ZERO));
  const liabilityAfter = roundMoney(presentValue(cash, p, rate, input.timing, false), dp);

  const postings: Posting[] = [];
  let profitOrLoss = ZERO;
  let liabilityBase = liabilityBefore;
  let rouBase = rouBefore;
  if (decrease) {
    // IFRS 16.46(a) and IE Example 17: derecognise the share of the asset and liability given up.
    const liabilityOut = roundMoney(liabilityBefore.times(decrease), dp);
    const rouOut = roundMoney(rouBefore.times(decrease), dp);
    const gain = liabilityOut.minus(rouOut);
    postings.push(['LEASE_LIABILITY', liabilityOut], ['ROU_ASSET', rouOut.neg()], ['MODIFICATION_GAIN_LOSS', gain.neg()]);
    profitOrLoss = profitOrLoss.plus(gain);
    liabilityBase = liabilityBefore.minus(liabilityOut);
    rouBase = rouBefore.minus(rouOut);
  }

  const delta = liabilityAfter.minus(liabilityBase);
  let rouAfter: Dec;
  if (!delta.isNegative()) {
    rouAfter = rouBase.plus(delta);
    postings.push(['ROU_ASSET', delta], ['LEASE_LIABILITY', delta.neg()]);
  } else {
    // IFRS 16.39: a reduction beyond the asset's carrying amount goes to profit or loss.
    const reduction = D.min(delta.neg(), rouBase);
    const excess = delta.neg().minus(reduction);
    rouAfter = rouBase.minus(reduction);
    postings.push(['LEASE_LIABILITY', delta.neg()], ['ROU_ASSET', reduction.neg()], ['MODIFICATION_GAIN_LOSS', excess.neg()]);
    profitOrLoss = profitOrLoss.plus(excess);
  }

  const depreciationEndPeriod = Math.max(
    p,
    depreciationEnd(
      {
        standard: input.standard,
        ...(usefulLifePeriods === undefined ? {} : { usefulLifePeriods }),
        transfersOwnership,
      },
      termPeriods,
    ),
  );

  const segment = schedule.events.length + 1;
  const newRows = runSegment({
    calendar: calendarFor(input),
    standard: input.standard,
    segment,
    startPeriod: p,
    termPeriods,
    depreciationEndPeriod,
    cash,
    periodRate: rate,
    openingLiability: liabilityAfter,
    openingRou: rouAfter,
    skipPaymentAtStart: false,
    dp,
  });

  const journal = remeasurementEntry(p, effectiveDate, MEMO[change.kind], postings, dp);
  const keptRows = schedule.rows.filter((r) => r.period < p).map(fromRow);
  const event: RemeasurementEvent = {
    kind: change.kind,
    effectiveDate,
    period: p,
    liabilityBefore: fmt(liabilityBefore, dp),
    rouBefore: fmt(rouBefore, dp),
    liabilityAfter: fmt(liabilityAfter, dp),
    rouAfter: fmt(rouAfter, dp),
    liabilityAdjustment: fmt(liabilityAfter.minus(liabilityBefore), dp),
    rouAdjustment: fmt(rouAfter.minus(rouBefore), dp),
    profitOrLoss: fmt(profitOrLoss, dp),
    annualDiscountRate: annualRate.toString(),
    journal,
  };

  const updated = assemble({
    input: { ...input, termPeriods, transfersOwnership, ...(usefulLifePeriods === undefined ? {} : { usefulLifePeriods }) },
    dp,
    perYear,
    rows: [...keptRows, ...newRows],
    initialLiability: new D(schedule.initialLiability),
    initialRou: new D(schedule.initialRou),
    commencement: schedule.commencement,
    basis: {
      rent: rent.map((v) => fmt(v, dp)),
      extra: extra.map((v) => fmt(v, dp)),
      annualDiscountRate: annualRate.toString(),
      periodRate: rate.toString(),
      termPeriods,
      depreciationEndPeriod,
    },
    events: [...schedule.events, event],
    notes: schedule.notes,
  });

  return {
    kind: change.kind,
    effectiveDate,
    before: { liability: event.liabilityBefore, rou: event.rouBefore },
    after: { liability: event.liabilityAfter, rou: event.rouAfter },
    adjustments: { liability: event.liabilityAdjustment, rou: event.rouAdjustment, profitOrLoss: event.profitOrLoss },
    journal,
    schedule: updated,
  };
}

function carryingAtPeriodStart(schedule: Schedule, date: string): { liability: string; rou: string } {
  const row = schedule.rows.find((r) => r.startDate === date);
  if (!row) {
    throw new LedgerError('INVALID_EFFECTIVE_DATE', 'A modification must take effect on the first day of a period');
  }
  return { liability: row.openingLiability, rou: row.openingRou };
}
