import { describe, expect, it } from 'vitest';
import { buildSchedule, classifyAsc842, effectiveTerm, LedgerError, maturityAnalysis, remeasure, scheduleJournals } from '../src/index.ts';
import type { LeaseAccountingInput } from '../src/index.ts';
import { eurOffice } from './examples.ts';

const base: LeaseAccountingInput = {
  currency: 'USD',
  commencementDate: '2025-01-01',
  frequency: 'ANNUAL',
  timing: 'ARREARS',
  termPeriods: 3,
  rent: { kind: 'FIXED', amount: '1000' },
  annualDiscountRate: '0.10',
  standard: 'IFRS16',
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof LedgerError ? e.code : 'NOT_A_LEDGER_ERROR';
  }
  return undefined;
}

describe('a textbook three-year lease', () => {
  // 1,000 a year in arrears at 10%: PV = 1000/1.1 + 1000/1.21 + 1000/1.331 = 2,486.85.
  const s = buildSchedule(base);

  it('measures and unwinds the liability as in the textbook', () => {
    expect(s.initialLiability).toBe('2486.85');
    expect(s.rows.map((r) => r.interest)).toEqual(['248.69', '173.55', '90.91']);
    expect(s.rows.map((r) => r.closingLiability)).toEqual(['1735.54', '909.09', '0.00']);
    expect(s.rows.map((r) => r.depreciation)).toEqual(['828.95', '828.95', '828.95']);
  });

  it('dates arrears payments at period end and advance payments at period start', () => {
    expect(s.rows[0]?.paymentDate).toBe('2025-12-31');
    const adv = buildSchedule({ ...base, timing: 'ADVANCE' });
    expect(adv.rows[1]?.paymentDate).toBe('2026-01-01');
    // In advance: 1,000 at commencement into the asset; PV of the other two = 1000/1.1 + 1000/1.21.
    expect(adv.initialLiability).toBe('1735.54');
    expect(adv.initialRou).toBe('2735.54');
  });
});

describe('rounding per currency', () => {
  it('uses three decimals for BHD and none for UGX', () => {
    expect(buildSchedule({ ...base, currency: 'BHD' }).initialLiability).toBe('2486.852');
    expect(buildSchedule({ ...base, currency: 'UGX', rent: { kind: 'FIXED', amount: '1000000' } }).initialLiability).toBe('2486852');
  });

  it('rejects a currency without a known minor unit', () => {
    expect(code(() => buildSchedule({ ...base, currency: 'XYZ' }))).toBe('UNKNOWN_CURRENCY');
  });
});

describe('depreciation period', () => {
  it('uses the shorter of useful life and term', () => {
    const s = buildSchedule({ ...base, termPeriods: 4, usefulLifePeriods: 2 });
    expect(s.rows.map((r) => r.depreciation).slice(2)).toEqual(['0.00', '0.00']);
  });

  it('uses the useful life when ownership transfers, beyond the term', () => {
    const s = buildSchedule({ ...base, usefulLifePeriods: 5, transfersOwnership: true });
    expect(s.rows).toHaveLength(5);
    expect(s.rows[4]?.closingRou).toBe('0.00');
    expect(s.rows[4]?.payment).toBe('0.00');
  });

  it('requires a useful life when ownership transfers', () => {
    expect(code(() => buildSchedule({ ...base, transfersOwnership: true }))).toBe('INVALID_INPUT');
  });
});

describe('ASC 842', () => {
  it('keeps the restoration obligation out of the ROU asset and says so', () => {
    const s = buildSchedule({ ...base, standard: 'ASC842_FINANCE', restorationProvision: '500' });
    expect(s.initialRou).toBe(s.initialLiability);
    expect(s.notes[0]).toMatch(/ASC 410-20/);
  });

  it('classifies a lease as finance if any criterion is met', () => {
    const criteria = {
      transfersOwnership: false,
      purchaseOptionReasonablyCertain: false,
      leaseTermMonths: 60,
      remainingEconomicLifeMonths: 600,
      presentValueOfPayments: '531338',
      fairValue: '4000000',
      specialisedAsset: false,
    };
    expect(classifyAsc842(criteria)).toEqual({ classification: 'OPERATING', met: [] });
    expect(classifyAsc842({ ...criteria, leaseTermMonths: 480 }).met).toEqual(['MAJOR_PART_OF_LIFE']);
    expect(classifyAsc842({ ...criteria, presentValueOfPayments: '3600000' }).classification).toBe('FINANCE');
  });
});

describe('short-term and low-value exemptions', () => {
  it('expenses the payments straight-line with no liability or asset', () => {
    const s = buildSchedule({ ...base, exemption: 'SHORT_TERM', frequency: 'MONTHLY', termPeriods: 3, rent: { kind: 'STEPPED', steps: [{ fromPeriod: 1, amount: '0' }, { fromPeriod: 2, amount: '1500' }] } });
    expect(s.initialLiability).toBe('0.00');
    expect(s.rows.map((r) => r.leaseCost)).toEqual(['1000.00', '1000.00', '1000.00']);
    expect(scheduleJournals(s).every((j) => j.kind === 'EXEMPT_LEASE_COST')).toBe(true);
  });
});

describe('lease term', () => {
  it('adds renewals that are reasonably certain, in order', () => {
    const t = effectiveTerm({
      contractualMonths: 60,
      frequency: 'MONTHLY',
      options: [
        { kind: 'RENEWAL', months: 36, reasonablyCertain: true },
        { kind: 'RENEWAL', months: 36, reasonablyCertain: false },
        { kind: 'RENEWAL', months: 36, reasonablyCertain: true },
      ],
    });
    expect(t.termMonths).toBe(96);
  });

  it('stops at a break the lessee is reasonably certain to use', () => {
    const t = effectiveTerm({
      contractualMonths: 120,
      frequency: 'QUARTERLY',
      options: [
        { kind: 'BREAK', exercisableAtMonth: 60, reasonablyCertain: true },
        { kind: 'RENEWAL', months: 60, reasonablyCertain: true },
      ],
    });
    expect(t).toEqual({ termMonths: 60, termPeriods: 20, endedByBreakAtMonth: 60, renewalMonthsIncluded: 0 });
  });

  it('rejects a term that is not a whole number of periods', () => {
    expect(code(() => effectiveTerm({ contractualMonths: 13, frequency: 'QUARTERLY' }))).toBe('INVALID_TERM');
  });
});

describe('remeasurement', () => {
  const s = buildSchedule(eurOffice('IFRS16'));

  it('only takes effect on the first day of a later period within the term', () => {
    const index = { kind: 'INDEX_CHANGE', previousIndex: '100', newIndex: '103' } as const;
    expect(code(() => remeasure(s, index, '2025-03-15'))).toBe('INVALID_EFFECTIVE_DATE');
    expect(code(() => remeasure(s, index, '2025-01-01'))).toBe('INVALID_EFFECTIVE_DATE');
    expect(code(() => remeasure(s, index, '2025-03-01'))).toBeUndefined();
  });

  it('leaves earlier periods exactly as they were', () => {
    const r = remeasure(s, { kind: 'INDEX_CHANGE', previousIndex: '100', newIndex: '103' }, '2026-01-01');
    expect(r.schedule.rows.slice(0, 12)).toEqual(s.rows.slice(0, 12));
    expect(r.adjustments.liability).toBe(r.adjustments.rou);
  });

  it('sends a reduction beyond the asset to profit or loss', () => {
    // Rent falls to nothing for the rest of the term: the liability goes, and the asset with it.
    const r = remeasure(
      s,
      { kind: 'MODIFICATION_OTHER', revisedAnnualDiscountRate: '0.05', revisedPayment: '0' },
      '2029-01-01',
    );
    expect(r.after.liability).toBe('0.00');
    expect(r.after.rou).toBe('0.00');
    expect(Number(r.adjustments.profitOrLoss)).toBeGreaterThan(0);
    expect(r.schedule.rows.at(-1)?.closingRou).toBe('0.00');
  });

  it('reassesses the term at a revised rate, extending with the last rent', () => {
    const r = remeasure(s, { kind: 'TERM_REASSESSMENT', newTermPeriods: 84, revisedAnnualDiscountRate: '0.06' }, '2027-01-01');
    expect(r.schedule.rows).toHaveLength(84);
    expect(r.schedule.rows.at(-1)?.payment).toBe('10000.00');
    expect(r.schedule.events[0]?.annualDiscountRate).toBe('0.06');
  });

  it('adds a residual value guarantee at the unchanged rate', () => {
    const r = remeasure(s, { kind: 'RESIDUAL_GUARANTEE_CHANGE', period: 60, amount: '25000' }, '2027-01-01');
    expect(Number(r.adjustments.liability)).toBeGreaterThan(0);
    expect(r.schedule.rows.at(-1)?.payment).toBe('35000.00');
    expect(r.schedule.events[0]?.annualDiscountRate).toBe('0.05');
  });

  it('switches to useful-life depreciation when a purchase option becomes reasonably certain', () => {
    const r = remeasure(
      s,
      { kind: 'PURCHASE_OPTION_REASSESSMENT', exercisePrice: '150000', revisedAnnualDiscountRate: '0.055', usefulLifePeriods: 240 },
      '2027-01-01',
    );
    expect(r.schedule.rows).toHaveLength(240);
    expect(r.schedule.rows.at(-1)?.closingRou).toBe('0.00');
  });

  it('measures a separate lease on its own and returns the original unchanged', () => {
    const extra = { ...eurOffice('IFRS16'), commencementDate: '2026-01-01', termPeriods: 48 };
    const r = remeasure(s, { kind: 'MODIFICATION_SEPARATE_LEASE', lease: extra }, '2026-01-01');
    expect(r.schedule).toBe(s);
    expect(r.journal).toBeNull();
    expect(r.separateLease?.rows).toHaveLength(48);
  });

  it('rejects remeasuring an exempt lease', () => {
    const exempt = buildSchedule({ ...base, exemption: 'LOW_VALUE' });
    expect(code(() => remeasure(exempt, { kind: 'INDEX_CHANGE', previousIndex: '1', newIndex: '2' }, '2026-01-01'))).toBe('UNSUPPORTED_CHANGE');
  });
});

describe('maturity analysis', () => {
  it('splits a mid-period date correctly for arrears', () => {
    const s = buildSchedule(eurOffice('IFRS16'));
    const m = maturityAnalysis(s, '2025-06-15');
    expect(m.carryingAmount).toBe(s.rows[5]?.openingLiability);
    expect(m.bands[0]?.amount).toBe('120000.00');
  });

  it('refuses a date before commencement', () => {
    expect(code(() => maturityAnalysis(buildSchedule(base), '2024-12-31'))).toBe('INVALID_INPUT');
  });
});

describe('input validation', () => {
  it('rejects negative amounts, bad dates, bad rates and bad terms', () => {
    expect(code(() => buildSchedule({ ...base, rent: { kind: 'FIXED', amount: '-1' } }))).toBe('INVALID_INPUT');
    expect(code(() => buildSchedule({ ...base, commencementDate: '2025-02-30' }))).toBe('INVALID_INPUT');
    expect(code(() => buildSchedule({ ...base, annualDiscountRate: '1.5' }))).toBe('INVALID_INPUT');
    expect(code(() => buildSchedule({ ...base, termPeriods: 0 }))).toBe('INVALID_TERM');
    expect(code(() => buildSchedule({ ...base, incentivesReceived: '999999' }))).toBe('INVALID_INPUT');
  });

  it('clamps period dates to month ends', () => {
    const s = buildSchedule({ ...base, commencementDate: '2025-01-31', frequency: 'MONTHLY', termPeriods: 3 });
    expect(s.rows.map((r) => [r.startDate, r.endDate])).toEqual([
      ['2025-01-31', '2025-02-27'],
      ['2025-02-28', '2025-03-30'],
      ['2025-03-31', '2025-04-29'],
    ]);
  });
});
