import { describe, expect, it } from 'vitest';
import { figuresAt, leaseAccounting, rollForward, yearTotals, type AccountingLease } from './accounting.ts';

const lease: AccountingLease = {
  commencement_date: '2027-01-01', expiry_date: '2031-12-31', currency: 'KES', payment_frequency: 'QUARTERLY', payment_timing: 'ADVANCE',
  rent_per_period: '600000', discount_rate: '0.12', initial_direct_costs: 0, incentives: 0, prepayments: 0, restoration_cost: 0,
  useful_life_months: null, ownership_transfers: false, standard: 'IFRS16', asc842_class: null, exemption: 'NONE',
};

describe('lease accounting', () => {
  // A signed lease that starts in a few months once broke the portfolio summary: the engine refuses
  // an analysis date before commencement.
  it('carries nothing for a lease not yet started: it is recognised at commencement', () => {
    const { schedule } = leaseAccounting(lease, [], [], '2026-11-02');
    const f = figuresAt(schedule, '2026-11-02');
    expect(f.liability).toBe('0.00');
    expect(f.rou).toBe('0.00');
    expect(f.maturity.bands.every((b) => b.amount === '0.00')).toBe(true);
    expect(rollForward(schedule, '2026-11-02').close).toBe('0.00');
  });

  it('applies an index rent change after commencement as a remeasurement', () => {
    const started = { ...lease, commencement_date: '2023-01-01', expiry_date: '2027-12-31' };
    const { remeasurements } = leaseAccounting(started, [{ starts_on: '2024-01-01', rent_per_period: '630000' }], [{ kind: 'CPI', rate: null, every_months: 12 }], '2026-11-02');
    expect(remeasurements).toHaveLength(1);
    expect(Number(remeasurements[0]!.adjustments.liability)).toBeGreaterThan(0);
  });

  // The roll-forward is built row by row, so it reconciles to the penny, remeasurements included.
  it('rolls the liability forward exactly: opening + additions + interest - payments + remeasurements = closing', () => {
    const started = { ...lease, commencement_date: '2023-01-01', expiry_date: '2029-12-31' };
    const { schedule } = leaseAccounting(started, [{ starts_on: '2026-04-01', rent_per_period: '660000' }], [{ kind: 'CPI', rate: null, every_months: 12 }], '2026-11-02');
    const r = rollForward(schedule, '2026-11-02');
    const sum = Number(r.open) + Number(r.additions) + Number(r.interest) - Number(r.payments) + Number(r.remeasure);
    expect(Math.abs(sum - Number(r.close))).toBeLessThan(0.01);
    expect(Number(r.remeasure)).toBeGreaterThan(0);
    expect(r.monthlyInterest).toHaveLength(12);
  });

  it('opens a lease commencing this year at nothing and adds its first balance', () => {
    const r = rollForward(leaseAccounting({ ...lease, commencement_date: '2026-02-01', expiry_date: '2030-01-31' }, [], [], '2026-11-02').schedule, '2026-11-02');
    expect(r.open).toBe('0.00');
    expect(Number(r.additions)).toBeGreaterThan(0);
  });

  // The roll-forward ends at the same figure as the headline: the carrying amount on the date. Checked
  // to the cent for advance and arrears leases, monthly and quarterly, with and without index changes,
  // on many dates (period ends, mid-period, 1 January, before commencement and after expiry).
  it('rolls forward to exactly the carrying amount on any date', () => {
    const cents = (v: string) => Math.round(Number(v) * 100);
    const leases: [AccountingLease, { starts_on: string; rent_per_period: string }[]][] = [
      [{ ...lease, commencement_date: '2023-01-01', expiry_date: '2029-12-31' }, [{ starts_on: '2025-01-01', rent_per_period: '640000' }]],
      [{ ...lease, commencement_date: '2024-03-15', expiry_date: '2031-03-14', payment_timing: 'ARREARS' }, []],
      [{ ...lease, commencement_date: '2025-06-01', expiry_date: '2030-05-31', payment_frequency: 'MONTHLY', rent_per_period: '210000' }, [{ starts_on: '2026-06-01', rent_per_period: '220000' }]],
      [{ ...lease, commencement_date: '2026-07-01', expiry_date: '2027-06-30', payment_frequency: 'MONTHLY', rent_per_period: '90000', payment_timing: 'ARREARS' }, []],
    ];
    for (const [l, steps] of leases) {
      for (let y = 2023; y <= 2032; y++) {
        for (const md of ['01-01', '02-14', '03-31', '06-30', '07-15', '09-30', '11-03', '12-31']) {
          const date = `${y}-${md}`;
          // As the app does: index changes are applied up to the date measured.
          const { schedule } = leaseAccounting(l, steps, [{ kind: 'CPI', rate: null, every_months: 12 }], date);
          const r = rollForward(schedule, date);
          const sum = cents(r.open) + cents(r.additions) + cents(r.interest) - cents(r.payments) + cents(r.remeasure);
          expect(sum, `${l.commencement_date} on ${date}`).toBe(cents(r.close));
          let liability = '';
          try { liability = figuresAt(schedule, date).liability; } catch (e) { throw new Error(`${l.commencement_date} ${l.payment_timing} ${l.payment_frequency} on ${date}: ${(e as Error).message}`); }
          expect(r.close, `${l.commencement_date} on ${date}`).toBe(liability);
        }
      }
    }
  });

  it('spreads a quarter\'s charge over its months, and the months add up to the year', () => {
    const quarterly = { ...lease, commencement_date: '2024-01-01', expiry_date: '2030-12-31' };
    const { schedule } = leaseAccounting(quarterly, [], [], '2026-11-03');
    const r = rollForward(schedule, '2026-11-03');
    const year = yearTotals(schedule, 2026);
    const total = (xs: string[]) => xs.reduce((a, x) => a + Math.round(Number(x) * 100), 0);
    expect(total(r.monthlyInterest)).toBe(Math.round(Number(year.interest) * 100));
    expect(total(r.monthlyDepreciation)).toBe(Math.round(Number(year.depreciation) * 100));
    // Depreciation is straight-line: no month carries a quarter's worth.
    const dep = r.monthlyDepreciation.map(Number);
    expect(Math.max(...dep) / Math.min(...dep)).toBeLessThan(1.15);
  });
});

