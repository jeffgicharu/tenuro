import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { buildSchedule, scheduleJournals } from '../src/index.ts';
import type { LeaseAccountingInput } from '../src/index.ts';

const tenYearsMonthly: LeaseAccountingInput = {
  currency: 'EUR',
  commencementDate: '2025-01-01',
  frequency: 'MONTHLY',
  timing: 'ARREARS',
  termPeriods: 120,
  rent: { kind: 'FIXED_ESCALATION', amount: '25000', annualRate: '0.03' },
  annualDiscountRate: '0.055',
  initialDirectCosts: '15000',
  standard: 'IFRS16',
};

function measure(label: string, fn: () => unknown): number {
  for (let i = 0; i < 200; i++) fn();
  const timings: number[] = [];
  for (let i = 0; i < 2_000; i++) {
    const start = performance.now();
    fn();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(timings.length / 2)] ?? Infinity;
  const p95 = timings[Math.floor(timings.length * 0.95)] ?? Infinity;
  process.stdout.write(`${label}: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms over ${timings.length} runs\n`);
  return median;
}

it('builds a 120-period schedule quickly enough to compute on request', () => {
  const schedule = measure('120-period schedule', () => buildSchedule(tenYearsMonthly));
  const built = buildSchedule(tenYearsMonthly);
  measure('its journals (361 entries)', () => scheduleJournals(built));
  // A regression guard, not a target: see docs/accounting/method.md for measured figures.
  expect(schedule).toBeLessThan(3);
});
