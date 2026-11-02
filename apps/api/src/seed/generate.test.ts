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

  // Terminations were clamped to the rebuild day, so recent activity read "terminated, today" seven times over.
  it('spreads recent activity across past days instead of piling it on the rebuild day', () => {
    const today = '2026-11-02';
    const past = data.activity.filter((a) => String(a.created_at).slice(0, 10) <= today);
    const onToday = past.filter((a) => String(a.created_at).startsWith(today)).length;
    expect(past.length).toBeGreaterThan(100);
    expect(onToday / past.length).toBeLessThan(0.02);
  });

  // 10,000 leases once added up to 9.65 million m² and KES 133 billion a year: more than the region's
  // grade-A office stock. An occupier's estate is branches, offices and depots.
  it('keeps the whole estate to an occupier’s scale', () => {
    const live = data.lease.filter((l) => l.status === 'ACTIVE' || l.status === 'HOLDING_OVER');
    const meanArea = live.reduce((n, l) => n + Number(l.area_sqm), 0) / live.length;
    expect(meanArea).toBeGreaterThan(120);
    expect(meanArea).toBeLessThan(450);
  });

  it('leaves a small share of recent key dates open past their due date', () => {
    const today = '2026-11-02';
    const open = data.key_date.filter((k) => k.status === 'UPCOMING');
    const overdue = open.filter((k) => String(k.due_on) < today);
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.length / open.length).toBeLessThan(0.06);
    // Mostly recent slips, a few weeks old at most, with a short tail (not all ten weeks late).
    const ages = overdue.map((k) => (Date.parse(today) - Date.parse(String(k.due_on))) / 86_400_000).sort((x, y) => x - y);
    expect(ages[Math.floor(ages.length / 2)]!).toBeLessThan(30);
    expect(ages.at(-1)!).toBeLessThanOrEqual(70);
  });

  it('records system events without a person, and a mix of what people did', () => {
    const verbs = new Set(data.activity.map((a) => a.verb));
    for (const v of ['NOTICE_SERVED', 'DECISION_RECORDED', 'DOCUMENT_ADDED', 'RENT_CHANGED', 'STATUS_CHANGED']) expect(verbs).toContain(v);
    expect(data.activity.filter((a) => a.verb === 'STATUS_CHANGED' && a.actor_id === null).length).toBeGreaterThan(0);
  });

  // Four of seven feed entries once read "Lease … created" by the same admin.
  it('mixes kinds of event and people in the recent feed', () => {
    const recent = data.activity.filter((a) => { const d = String(a.created_at).slice(0, 10); return d <= '2026-11-02' && d >= '2026-09-18'; });
    const byVerb = new Map<string, number>();
    const byActor = new Map<string, number>();
    for (const a of recent) {
      // By what the entry says: rent changes alone cover settled reviews, agreed reviews and indexation.
      byVerb.set(String(a.summary).replace(/\S*\d\S*/g, '#'), (byVerb.get(String(a.summary).replace(/\S*\d\S*/g, '#')) ?? 0) + 1);
      if (a.actor_id !== null) byActor.set(String(a.actor_id), (byActor.get(String(a.actor_id)) ?? 0) + 1);
    }
    expect(byVerb.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...byVerb.values()) / recent.length).toBeLessThan(0.4);
    const byPeople = [...byActor.values()].reduce((n, c) => n + c, 0);
    expect(Math.max(...byActor.values()) / byPeople).toBeLessThan(0.35);
  });
});
