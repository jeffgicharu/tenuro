import { describe, expect, it } from 'vitest';
import { generate } from './generate.ts';
import { PER_USD } from './markets.ts';

// A product review found every lease on the first page expiring on 30 Sept or 30 Nov, and single
// shops renting for over USD 200,000 a year. These pin the seed to plausible shapes.
const data = generate({ today: '2026-11-02', scale: 0.15 });
const usd = (amount: string | number, currency: string) => Number(amount) / (PER_USD[currency] ?? 1);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe('seed realism', () => {
  it('spreads expiries across days of the month instead of month ends', () => {
    const days = new Map<string, number>();
    for (const l of data.lease) days.set(String(l.expiry_date).slice(8), (days.get(String(l.expiry_date).slice(8)) ?? 0) + 1);
    const top = Math.max(...days.values()) / data.lease.length;
    expect(days.size).toBeGreaterThan(20);
    expect(top).toBeLessThan(0.7);
  });

  it('spreads expiries across months and years', () => {
    const months = new Set(data.lease.map((l) => String(l.expiry_date).slice(0, 7)));
    expect(months.size).toBeGreaterThan(60);
  });

  it('starts English leases on quarter days more often than not', () => {
    const gb = data.lease.filter((l) => String(l.reference).startsWith('GB-'));
    expect(gb.length).toBeGreaterThan(20);
    const quarterDays = gb.filter((l) => ['03-25', '06-24', '09-29', '12-25'].includes(String(l.commencement_date).slice(5))).length;
    expect(quarterDays / gb.length).toBeGreaterThan(0.45);
  });

  it('keeps a typical shop at a believable rent and size', () => {
    const shops = data.lease.filter((l) => String(l.reference).slice(3, 4) === 'R');
    const perPeriodToYear: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };
    const annualUsd = shops.map((l) => usd(l.rent_per_period as number, String(l.currency)) * perPeriodToYear[String(l.payment_frequency)]!);
    const areas = shops.map((l) => Number(l.area_sqm));
    expect(median(areas)).toBeLessThan(220);
    expect(median(annualUsd)).toBeGreaterThan(8_000);
    expect(median(annualUsd)).toBeLessThan(90_000);
  });

  it('keeps office rent per square metre within market ranges', () => {
    const offices = data.lease.filter((l) => String(l.reference).slice(3, 4) === 'O' && /^(KE|UG|TZ|RW)-/.test(String(l.reference)));
    const perPeriodToMonths: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };
    const perSqmMonth = offices.map((l) => usd(l.rent_per_period as number, String(l.currency)) / perPeriodToMonths[String(l.payment_frequency)]! / Number(l.area_sqm));
    expect(median(perSqmMonth)).toBeGreaterThan(6);
    expect(median(perSqmMonth)).toBeLessThan(20);
  });
});
