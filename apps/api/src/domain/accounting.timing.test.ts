import { buildSchedule, maturityAnalysis } from '@tenuro/ledger';
import { expect, it } from 'vitest';
import { accountingInput, figuresAt, leaseAccounting, rollForward, yearTotals, type AccountingLease } from './accounting.ts';

// What the nightly rebuild does for each live lease, phase by phase, so the CI log shows where the
// time goes (the rebuild measures about twelve thousand leases). Not a pass/fail budget: runners vary.

const lease: AccountingLease = {
  commencement_date: '2021-03-01', expiry_date: '2031-02-28', currency: 'EUR', payment_frequency: 'MONTHLY', payment_timing: 'ADVANCE',
  rent_per_period: '42000', discount_rate: '0.061', initial_direct_costs: '12000', incentives: 0, prepayments: 0, restoration_cost: '30000',
  useful_life_months: null, ownership_transfers: false, standard: 'IFRS16', asc842_class: null, exemption: 'NONE',
};
const cpi = [{ kind: 'CPI' as const, rate: null, every_months: 12 }];
const steps = [2022, 2023, 2024, 2025, 2026].map((y, i) => ({ starts_on: `${y}-03-01`, rent_per_period: String(42000 + 1500 * (i + 1)) }));
const today = '2026-11-02';

function median(fn: () => unknown, runs = 150): number {
  for (let i = 0; i < 30; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)]!;
}

it('reports the time of each step of measuring one lease', () => {
  const input = accountingInput(lease, cpi);
  const base = buildSchedule(input);
  const { schedule } = leaseAccounting(lease, steps, cpi, today);
  const ms = {
    buildSchedule: median(() => buildSchedule(input)),
    'leaseAccounting (base + 5 index reviews)': median(() => leaseAccounting(lease, steps, cpi, today)),
    figuresAt: median(() => figuresAt(schedule, today)),
    maturityAnalysis: median(() => maturityAnalysis(schedule, today)),
    yearTotals: median(() => yearTotals(schedule, 2026)),
    rollForward: median(() => rollForward(schedule, today)),
  };
  const lines = Object.entries(ms).map(([k, v]) => `  ${k.padEnd(44)} ${v.toFixed(3)} ms`);
  console.log(`measuring one 10-year monthly lease (${base.rows.length} periods):\n${lines.join('\n')}`);
  expect(ms.buildSchedule).toBeGreaterThan(0);
});
