import { describe, expect, it } from 'vitest';
import { buildSchedule, maturityAnalysis, scheduleJournals } from '../src/index.ts';
import type { Schedule } from '../src/index.ts';
import { aedWarehouse, eurOffice, kesSequence, readCsv } from './examples.ts';

/**
 * Every figure here is compared, to the minor unit, with fixtures produced by
 * fixtures/generate.py, an independent implementation of the same method.
 */

function scheduleRows(s: Schedule): Array<Record<string, string>> {
  return s.rows.map((r) => ({
    period: String(r.period),
    start: r.startDate,
    end: r.endDate,
    payment_date: r.paymentDate,
    opening_liability: r.openingLiability,
    payment: r.payment,
    interest: r.interest,
    closing_liability: r.closingLiability,
    opening_rou: r.openingRou,
    depreciation: r.depreciation,
    closing_rou: r.closingRou,
    lease_cost: r.leaseCost,
    cash_paid: r.cashPaid,
    segment: String(r.segment),
  }));
}

function journalLines(s: Schedule): string[] {
  return scheduleJournals(s)
    .flatMap((e) => e.lines.map((l) => [String(e.period), e.date, l.account, l.debit, l.credit].join(',')))
    .sort();
}

function summary(s: Schedule): Record<string, string> {
  const out: Record<string, string> = {
    initial_liability: s.initialLiability,
    initial_rou: s.initialRou,
    commencement_payment: s.commencementPayment,
    total_payment: s.totals.payments,
    total_cash_paid: s.totals.cashPaid,
    total_interest: s.totals.interest,
    total_depreciation: s.totals.depreciation,
    total_lease_cost: s.totals.leaseCost,
  };
  s.events.forEach((e, i) => {
    const n = i + 1;
    out[`event${n}_liability_before`] = e.liabilityBefore;
    out[`event${n}_rou_before`] = e.rouBefore;
    out[`event${n}_liability_after`] = e.liabilityAfter;
    out[`event${n}_rou_after`] = e.rouAfter;
    out[`event${n}_liability_adjustment`] = e.liabilityAdjustment;
    out[`event${n}_rou_adjustment`] = e.rouAdjustment;
    out[`event${n}_profit_or_loss`] = e.profitOrLoss;
  });
  return out;
}

function maturityRows(s: Schedule, asOf: string): Array<Record<string, string>> {
  const m = maturityAnalysis(s, asOf);
  return [
    ...m.bands.map((b) => ({ as_of: asOf, band: b.key, amount: b.amount })),
    { as_of: asOf, band: 'TOTAL_UNDISCOUNTED', amount: m.totalUndiscounted },
    { as_of: asOf, band: 'FUTURE_INTEREST', amount: m.futureInterest },
    { as_of: asOf, band: 'CARRYING_AMOUNT', amount: m.carryingAmount },
    { as_of: asOf, band: 'CURRENT', amount: m.current },
    { as_of: asOf, band: 'NON_CURRENT', amount: m.nonCurrent },
  ];
}

function matchesFixture(name: string, s: Schedule, asOf: string): void {
  const expectedRows = readCsv(`${name}.schedule.csv`);
  const actualRows = scheduleRows(s);
  expect(actualRows.length).toBe(expectedRows.length);
  actualRows.forEach((row, i) => expect(row, `period ${row.period}`).toEqual(expectedRows[i]));

  const expectedLines = readCsv(`${name}.journal.csv`)
    .map((l) => [l.period, l.date, l.account, l.debit, l.credit].join(','))
    .sort();
  expect(journalLines(s)).toEqual(expectedLines);

  const expectedSummary = Object.fromEntries(readCsv(`${name}.summary.csv`).map((r) => [r.key, r.value]));
  expect(summary(s)).toEqual(expectedSummary);

  expect(maturityRows(s, asOf)).toEqual(readCsv(`${name}.maturity.csv`));
}

describe('Example 1: EUR office, 5 years monthly in arrears', () => {
  it('matches the IFRS 16 fixture in every period, journal line and maturity band', () => {
    matchesFixture('eur-office-ifrs16', buildSchedule(eurOffice('IFRS16')), '2025-12-31');
  });

  it('matches the ASC 842 operating-lease fixture', () => {
    matchesFixture('eur-office-asc842-operating', buildSchedule(eurOffice('ASC842_OPERATING')), '2025-12-31');
  });

  it('recognises a level straight-line cost under ASC 842 operating, with ROU amortisation as the plug', () => {
    const s = buildSchedule(eurOffice('ASC842_OPERATING'));
    // (60 × 10,000 + 6,000 IDC − 12,000 incentive) / 60 = 9,900.00 a month.
    expect(new Set(s.rows.map((r) => r.leaseCost))).toEqual(new Set(['9900.00']));
    for (const r of s.rows) {
      expect(Number(r.interest) + Number(r.depreciation)).toBeCloseTo(9900, 6);
    }
  });

  it('measures the liability at the present value of 60 arrears payments', () => {
    const s = buildSchedule(eurOffice('IFRS16'));
    expect(s.initialLiability).toBe('531338.38');
    expect(s.initialRou).toBe('525338.38'); // 531,338.38 + 6,000 − 12,000
  });
});

describe('Example 2: AED warehouse, quarterly in advance, renewal reasonably certain', () => {
  it('matches the fixture', () => {
    matchesFixture('aed-warehouse-ifrs16', buildSchedule(aedWarehouse()), '2025-12-31');
  });

  it('keeps the commencement payment out of the liability and in the asset', () => {
    const s = buildSchedule(aedWarehouse());
    expect(s.commencementPayment).toBe('375000.00');
    expect(s.rows[0]?.payment).toBe('0.00');
    expect(s.rows[0]?.cashPaid).toBe('375000.00');
    expect(s.input.termPeriods).toBe(60);
  });
});

describe('Example 3: KES office with four changes in year 3', () => {
  const { schedule, extraFloor } = kesSequence();

  it('matches the fixture through the index change, scope decrease and extension', () => {
    matchesFixture('kes-office-ifrs16', schedule, '2026-12-31');
  });

  it('accounts for the added floor as a separate lease and leaves the head lease untouched', () => {
    matchesFixture('kes-extra-floor-ifrs16', extraFloor, '2026-12-31');
    expect(schedule.events.map((e) => e.kind)).toEqual(['INDEX_CHANGE', 'MODIFICATION_SCOPE_DECREASE', 'MODIFICATION_OTHER']);
  });

  it('uses the original rate for the index change and revised rates after', () => {
    expect(schedule.events.map((e) => e.annualDiscountRate)).toEqual(['0.13', '0.14', '0.145']);
  });

  it('books a gain on the scope decrease', () => {
    expect(schedule.events[1]?.profitOrLoss).toBe('1815734.42');
  });
});
