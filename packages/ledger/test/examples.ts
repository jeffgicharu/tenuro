import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchedule, effectiveTerm, remeasure } from '../src/index.ts';
import type { AccountingStandard, LeaseAccountingInput, Schedule } from '../src/index.ts';

/** The worked examples, set up through the public API exactly as the API layer would. */

export function eurOffice(standard: AccountingStandard): LeaseAccountingInput {
  return {
    currency: 'EUR',
    commencementDate: '2025-01-01',
    frequency: 'MONTHLY',
    timing: 'ARREARS',
    termPeriods: 60,
    rent: { kind: 'FIXED', amount: '10000' },
    annualDiscountRate: '0.05',
    initialDirectCosts: '6000',
    incentivesReceived: '12000',
    standard,
  };
}

export function aedWarehouse(): LeaseAccountingInput {
  const term = effectiveTerm({
    contractualMonths: 120,
    frequency: 'QUARTERLY',
    options: [{ kind: 'RENEWAL', months: 60, reasonablyCertain: true }],
  });
  return {
    currency: 'AED',
    commencementDate: '2025-01-01',
    frequency: 'QUARTERLY',
    timing: 'ADVANCE',
    termPeriods: term.termPeriods,
    rent: { kind: 'FIXED_ESCALATION', amount: '375000', annualRate: '0.03' },
    annualDiscountRate: '0.0625',
    initialDirectCosts: '45000',
    restorationProvision: '150000',
    standard: 'IFRS16',
  };
}

export function kesOffice(): LeaseAccountingInput {
  return {
    currency: 'KES',
    commencementDate: '2024-01-01',
    frequency: 'MONTHLY',
    timing: 'ARREARS',
    termPeriods: 96,
    rent: { kind: 'INDEXED', amount: '850000' },
    annualDiscountRate: '0.13',
    initialDirectCosts: '250000',
    standard: 'IFRS16',
  };
}

export function kesExtraFloor(): LeaseAccountingInput {
  return {
    currency: 'KES',
    commencementDate: '2026-10-01',
    frequency: 'MONTHLY',
    timing: 'ARREARS',
    termPeriods: 87,
    rent: { kind: 'FIXED', amount: '420000' },
    annualDiscountRate: '0.145',
    standard: 'IFRS16',
  };
}

export function kesSequence(): { schedule: Schedule; extraFloor: Schedule } {
  let s = buildSchedule(kesOffice());
  s = remeasure(s, { kind: 'INDEX_CHANGE', previousIndex: '100.0', newIndex: '106.5' }, '2026-01-01').schedule;
  s = remeasure(s, { kind: 'MODIFICATION_SCOPE_DECREASE', fraction: '0.4', revisedAnnualDiscountRate: '0.14' }, '2026-04-01').schedule;
  s = remeasure(s, { kind: 'MODIFICATION_OTHER', revisedAnnualDiscountRate: '0.145', newTermPeriods: 120 }, '2026-07-01').schedule;
  const separate = remeasure(s, { kind: 'MODIFICATION_SEPARATE_LEASE', lease: kesExtraFloor() }, '2026-10-01');
  if (!separate.separateLease) throw new Error('expected a separate lease');
  return { schedule: separate.schedule, extraFloor: separate.separateLease };
}

export function readCsv(name: string): Array<Record<string, string>> {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const keys = (header ?? '').split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
  });
}
