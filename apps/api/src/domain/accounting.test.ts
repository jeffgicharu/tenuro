import { describe, expect, it } from 'vitest';
import { figuresAt, leaseAccounting, rollForward, type AccountingLease } from './accounting.ts';

const lease: AccountingLease = {
  commencement_date: '2027-01-01', expiry_date: '2031-12-31', currency: 'KES', payment_frequency: 'QUARTERLY', payment_timing: 'ADVANCE',
  rent_per_period: '600000', discount_rate: '0.12', initial_direct_costs: 0, incentives: 0, prepayments: 0, restoration_cost: 0,
  useful_life_months: null, ownership_transfers: false, standard: 'IFRS16', asc842_class: null, exemption: 'NONE',
};

describe('lease accounting', () => {
  // A signed lease that starts in a few months once broke the portfolio summary: the engine refuses
  // an analysis date before commencement.
  it('gives a lease not yet started its figures at commencement, with every payment ahead', () => {
    const { schedule } = leaseAccounting(lease, [], [], '2026-11-02');
    const f = figuresAt(schedule, '2026-11-02');
    expect(f.liability).toBe(schedule.initialLiability);
    expect(f.rou).toBe(schedule.initialRou);
    const ahead = f.maturity.bands.reduce((n, b) => n + Number(b.amount), 0);
    // Rent in advance: the first of the 20 payments is made at commencement (in the asset, not the
    // liability), so 19 are still ahead.
    expect(ahead).toBeCloseTo(600000 * 19, 0);
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
});
