import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACCOUNTS, buildSchedule, maturityAnalysis, remeasure, scheduleJournals } from '../src/index.js';
import type { LeaseAccountingInput, Schedule } from '../src/index.js';

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

const leaseArb: fc.Arbitrary<LeaseAccountingInput> = fc
  .record({
    currency: fc.constantFrom('EUR', 'KES', 'BHD', 'UGX', 'AED'),
    frequency: fc.constantFrom('MONTHLY', 'QUARTERLY', 'ANNUAL'),
    timing: fc.constantFrom('ADVANCE', 'ARREARS'),
    termPeriods: fc.integer({ min: 1, max: 120 }),
    amount: fc.integer({ min: 1, max: 50_000_000 }),
    upliftBp: fc.integer({ min: 0, max: 1_000 }),
    rateBp: fc.integer({ min: 0, max: 3_000 }),
    idc: fc.integer({ min: 0, max: 100_000 }),
    restoration: fc.integer({ min: 0, max: 200_000 }),
    standard: fc.constantFrom('IFRS16', 'ASC842_FINANCE', 'ASC842_OPERATING'),
    lifeShorter: fc.boolean(),
  })
  .map((v) => ({
    currency: v.currency,
    commencementDate: '2025-01-31',
    frequency: v.frequency,
    timing: v.timing,
    termPeriods: v.termPeriods,
    rent: { kind: 'FIXED_ESCALATION', amount: String(v.amount), annualRate: String(v.upliftBp / 10_000) },
    annualDiscountRate: String(v.rateBp / 10_000),
    initialDirectCosts: String(v.idc),
    restorationProvision: String(v.restoration),
    ...(v.lifeShorter && v.termPeriods > 1 ? { usefulLifePeriods: Math.ceil(v.termPeriods / 2) } : {}),
    standard: v.standard,
  }));

function last<T>(xs: readonly T[]): T {
  const x = xs[xs.length - 1];
  if (x === undefined) throw new Error('empty');
  return x;
}

function accountBalance(s: Schedule, code: string): Decimal {
  let total = new D(0);
  for (const e of scheduleJournals(s)) {
    for (const l of e.lines) if (l.account === code) total = total.plus(l.debit).minus(l.credit);
  }
  return total;
}

function assertWellFormed(s: Schedule): void {
  const end = last(s.rows);
  expect(end.closingLiability).toBe(new D(0).toFixed(s.minorUnits));
  expect(end.closingRou).toBe(new D(0).toFixed(s.minorUnits));
  for (const e of scheduleJournals(s)) {
    const debits = e.lines.reduce((a, l) => a.plus(l.debit), new D(0));
    const credits = e.lines.reduce((a, l) => a.plus(l.credit), new D(0));
    expect(debits.equals(credits), `${e.kind} period ${e.period} balances`).toBe(true);
  }
  // The general ledger agrees with the schedule: both balances are cleared by the journals.
  expect(accountBalance(s, ACCOUNTS.LEASE_LIABILITY.code).isZero()).toBe(true);
  expect(
    accountBalance(s, ACCOUNTS.ROU_ASSET.code).plus(accountBalance(s, ACCOUNTS.ROU_ACCUMULATED.code)).isZero(),
  ).toBe(true);
}

describe('properties of random leases', () => {
  it('ends both balances at exactly zero and posts balanced journals that agree with the schedule', () => {
    fc.assert(fc.property(leaseArb, (input) => assertWellFormed(buildSchedule(input))), { numRuns: 400 });
  });

  it('charges total interest equal to payments less the initial liability', () => {
    fc.assert(
      fc.property(leaseArb, (input) => {
        const s = buildSchedule(input);
        expect(new D(s.totals.interest).equals(new D(s.totals.payments).minus(s.initialLiability))).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('keeps the final-period rounding residual within the compounded half-unit bound', () => {
    // The initial liability and each period's interest are off by at most half a minor unit, and each
    // error then accrues interest itself, so the residual the last period absorbs is at most
    // ½ unit × Σ (1 + r)^k for k = 1..n. At ordinary monthly rates that is close to n/2 units.
    fc.assert(
      fc.property(leaseArb, (input) => {
        const s = buildSchedule(input);
        const n = s.basis.termPeriods;
        const final = s.rows.find((r) => r.period === n);
        if (!final) throw new Error('no final row');
        const base = input.timing === 'ADVANCE' ? new D(final.openingLiability).minus(final.payment) : new D(final.openingLiability);
        const unrounded = base.times(s.basis.periodRate);
        const residual = new D(final.interest).minus(unrounded).abs();
        const growth = new D(1).plus(s.basis.periodRate);
        let compounding = new D(0);
        for (let k = 1; k <= n; k++) compounding = compounding.plus(growth.pow(k));
        const bound = new D(10).pow(-s.minorUnits).times(0.5).times(compounding);
        expect(residual.lessThanOrEqualTo(bound), `residual ${residual.toString()} > bound ${bound.toString()}`).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('keeps the residual under n minor units at monthly rates up to 20% a year', () => {
    fc.assert(
      fc.property(leaseArb, fc.integer({ min: 0, max: 2_000 }), (input, rateBp) => {
        const s = buildSchedule({ ...input, frequency: 'MONTHLY', annualDiscountRate: String(rateBp / 10_000) });
        const n = s.basis.termPeriods;
        const final = s.rows.find((r) => r.period === n);
        if (!final) throw new Error('no final row');
        const base = input.timing === 'ADVANCE' ? new D(final.openingLiability).minus(final.payment) : new D(final.openingLiability);
        const residual = new D(final.interest).minus(base.times(s.basis.periodRate)).abs();
        expect(residual.lessThan(new D(10).pow(-s.minorUnits).times(n))).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('recognises total ASC 842 operating cost equal to payments plus IDC', () => {
    fc.assert(
      fc.property(leaseArb, (input) => {
        const s = buildSchedule({ ...input, standard: 'ASC842_OPERATING' });
        const expected = new D(s.totals.cashPaid).plus(input.initialDirectCosts ?? 0);
        expect(new D(s.totals.leaseCost).equals(expected)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('reconciles the maturity analysis to the carrying amount on any date', () => {
    fc.assert(
      fc.property(leaseArb, fc.integer({ min: 0, max: 3_650 }), (input, days) => {
        const s = buildSchedule(input);
        const asOf = new Date(Date.UTC(2025, 0, 31 + days)).toISOString().slice(0, 10);
        const m = maturityAnalysis(s, asOf);
        expect(new D(m.totalUndiscounted).minus(m.futureInterest).equals(m.carryingAmount)).toBe(true);
        expect(new D(m.current).plus(m.nonCurrent).equals(m.carryingAmount)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('stays well formed after an index change and a modification', () => {
    fc.assert(
      fc.property(
        leaseArb.filter((l) => l.termPeriods >= 4),
        fc.integer({ min: 80, max: 140 }),
        fc.integer({ min: 0, max: 3_000 }),
        (input, index, rateBp) => {
          let s = buildSchedule(input);
          const second = s.rows[1];
          const third = s.rows[2];
          if (!second || !third) throw new Error('short schedule');
          s = remeasure(s, { kind: 'INDEX_CHANGE', previousIndex: '100', newIndex: String(index) }, second.startDate).schedule;
          s = remeasure(
            s,
            { kind: 'MODIFICATION_OTHER', revisedAnnualDiscountRate: String(rateBp / 10_000), newTermPeriods: input.termPeriods + 2 },
            third.startDate,
          ).schedule;
          assertWellFormed(s);
        },
      ),
      { numRuns: 200 },
    );
  });
});
