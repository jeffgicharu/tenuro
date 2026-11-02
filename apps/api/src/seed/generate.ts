import Decimal from 'decimal.js';
import type { Insertable } from 'kysely';
import type {
  ActivityTable, AppUserTable, DepositTable, DocumentTable, EscalationTable, KeyDateTable, LeaseOptionTable,
  LeasePartyTable, LeaseTable, NotificationTable, PropertyTable, PropertyType, RentStepTable, SavedViewTable,
  TaskTable, TenantTable, FxRateTable, LeaseAccountingTable, KeyDateKind, TaskPriority, TaskStatus,
} from '../db/types.ts';
import { leaseAccounting, figuresAt, rollForward, yearTotals, type AccountingLease } from '../domain/accounting.ts';
import { addDays, addMonths, addYears, daysBetween, type IsoDate } from '../domain/dates.ts';
import { annualRent, MONTHS_PER_PERIOD, nextReviewOn, type RentTerms } from '../domain/rent.ts';
import { MINOR_UNITS, PER_USD, type Market } from './markets.ts';
import {
  EA_BUILDINGS, EA_LANDLORD_NOUNS, EA_LOGISTICS, EA_ROOTS, EU_BUILDINGS, EU_LANDLORD_NOUNS, EU_LOGISTICS, EU_ROOTS,
  GULF_BUILDINGS, GULF_LANDLORD_NOUNS, GULF_LANDLORD_PREFIX, GULF_LOGISTICS, GULF_ROOTS, PEOPLE, PREMISES, STREET_PATTERNS,
} from './names.ts';
import { Rng, stableId } from './rng.ts';
import { seedText } from './text.ts';
import { TENANTS, type TenantSeed } from './tenants.ts';

export interface SeedData {
  tenant: Insertable<TenantTable>[];
  app_user: Insertable<AppUserTable>[];
  property: Insertable<PropertyTable>[];
  lease: Insertable<LeaseTable>[];
  lease_party: Insertable<LeasePartyTable>[];
  rent_step: Insertable<RentStepTable>[];
  escalation: Insertable<EscalationTable>[];
  lease_option: Insertable<LeaseOptionTable>[];
  deposit: Insertable<DepositTable>[];
  key_date: Insertable<KeyDateTable>[];
  task: Insertable<TaskTable>[];
  document: Insertable<DocumentTable>[];
  activity: Insertable<ActivityTable>[];
  saved_view: Insertable<SavedViewTable>[];
  notification: Insertable<NotificationTable>[];
  fx_rate: Insertable<FxRateTable>[];
  lease_accounting: Insertable<LeaseAccountingTable>[];
}

export interface SeedOptions {
  today: IsoDate;
  scale?: number;
  only?: string[];
}

const ROUND_TO: Record<string, number> = {
  KES: 100, UGX: 10_000, TZS: 10_000, RWF: 1_000, USD: 10, AED: 100, SAR: 100, BHD: 5, OMR: 5, GBP: 50, EUR: 50,
};

const niceRound = (amount: number, currency: string) => {
  const step = ROUND_TO[currency] ?? 1;
  return Math.max(step, Math.round(amount / step) * step);
};

const toReporting = (amount: Decimal, from: string, to: string) =>
  amount.div(PER_USD[from] ?? 1).mul(PER_USD[to] ?? 1).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const ts = (iso: IsoDate, hour = 9, minute = 0) => `${iso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;

// Unit sizes per type, drawn log-uniformly: most shops are small units, with the odd anchor store;
// offices run from a single floor plate up to several floors.
const AREA: Record<PropertyType, [number, number]> = {
  // Sized for an occupier's estate (a branch, a regional office, a depot), not a landlord's
  // buildings: the whole portfolio must pass a sanity check against the market it sits in.
  OFFICE: [70, 700], RETAIL: [25, 300], MIXED_USE: [80, 500], WAREHOUSE: [300, 2400], INDUSTRIAL: [250, 1600],
};
const drawArea = (rng: Rng, type: PropertyType) => {
  const [lo, hi] = AREA[type];
  return Math.exp(rng.between(Math.log(lo), Math.log(hi)));
};

// When leases start: English leases mostly on a quarter day, continental ones often at the start
// of a calendar quarter, and elsewhere usually the 1st, sometimes the 15th or another day.
const QUARTER_DAY: Record<number, string> = { 3: '25', 6: '24', 9: '29', 12: '25' };
function leaseStart(rng: Rng, country: string, monthStart: IsoDate): IsoDate {
  const month = Number(monthStart.slice(5, 7));
  if (country === 'GB' && rng.chance(0.6)) {
    const snapped = addMonths(monthStart, (3 - (month % 3)) % 3);
    return snapped.slice(0, 8) + QUARTER_DAY[Number(snapped.slice(5, 7))]!;
  }
  if ((country === 'DE' || country === 'FR' || country === 'NL') && rng.chance(0.5)) {
    return addMonths(monthStart, (3 - ((month - 1) % 3)) % 3).slice(0, 8) + '01';
  }
  const roll = rng.next();
  const day = roll < 0.62 ? 1 : roll < 0.72 ? 15 : rng.int(2, 28);
  return monthStart.slice(0, 8) + String(day).padStart(2, '0');
}
const UNITS_PER_PROPERTY: Record<PropertyType, [number, number]> = {
  OFFICE: [3, 11], RETAIL: [4, 14], MIXED_USE: [3, 8], WAREHOUSE: [1, 3], INDUSTRIAL: [1, 3],
};

interface PropertyPick {
  row: Insertable<PropertyTable>;
  market: Market;
  units: number;
  landlord: string;
}

function personName(rng: Rng, region: TenantSeed['region']) {
  const set = region === 'EA' ? PEOPLE.EA : region === 'GULF' ? PEOPLE.GULF : PEOPLE.EU;
  return `${rng.pick(set.first)} ${rng.pick(set.last)}`;
}

function landlordName(rng: Rng, t: TenantSeed, market: Market): string {
  if (t.region === 'EA') return `${rng.pick(EA_ROOTS)} ${rng.pick(EA_LANDLORD_NOUNS)} ${market.landlordSuffix}`;
  if (t.region === 'GULF') return `${rng.pick(GULF_LANDLORD_PREFIX)} ${rng.pick(GULF_ROOTS)} ${rng.pick(GULF_LANDLORD_NOUNS)} ${market.landlordSuffix}`;
  const nouns = EU_LANDLORD_NOUNS[market.country] ?? ['Estates'];
  return `${rng.pick(EU_ROOTS)} ${rng.pick(nouns)} ${market.landlordSuffix}`;
}

function buildingName(rng: Rng, t: TenantSeed, market: Market, type: PropertyType): string {
  const logistics = type === 'WAREHOUSE' || type === 'INDUSTRIAL';
  if (t.region === 'EA') return `${rng.pick(EA_ROOTS)} ${rng.pick(logistics ? EA_LOGISTICS : EA_BUILDINGS)}`;
  if (t.region === 'GULF') return `${rng.pick(logistics ? GULF_LOGISTICS : GULF_BUILDINGS)} ${rng.pick(GULF_ROOTS)}`;
  const list = (logistics ? EU_LOGISTICS : EU_BUILDINGS)[market.country] ?? ['House'];
  const root = rng.pick(EU_ROOTS);
  return market.country === 'FR' ? `${rng.pick(list)} ${root}` : `${root} ${rng.pick(list)}`;
}

const emptySeed = (): SeedData => ({
  tenant: [], app_user: [], property: [], lease: [], lease_party: [], rent_step: [], escalation: [], lease_option: [],
  deposit: [], key_date: [], task: [], document: [], activity: [], saved_view: [], notification: [], fx_rate: [], lease_accounting: [],
});

// The whole seed portfolio in memory, for tests and the self-check.
export function generate(opts: SeedOptions): SeedData {
  const all = emptySeed();
  for (const batch of generateBatches(opts)) {
    for (const key of Object.keys(all) as (keyof SeedData)[]) (all[key] as unknown[]).push(...(batch[key] as unknown[]));
  }
  return all;
}

// Yields the portfolio in batches of about `batchLeases` leases with all their rows, so the
// rebuild can write and drop each batch and its memory stays flat on the shared server. Rows in a
// batch only reference rows in the same or an earlier batch.
export function* generateBatches(opts: SeedOptions, batchLeases = 400): Generator<SeedData> {
  let out = emptySeed();
  const { today } = opts;
  const scale = opts.scale ?? 1;

  for (const [currency, perUsd] of Object.entries(PER_USD)) {
    out.fx_rate.push({ currency, on_date: today, per_usd: perUsd });
  }

  for (const [tenantIndex, t] of TENANTS.entries()) {
    if (opts.only && !opts.only.includes(t.slug)) continue;
    // Small indexes kept across batches for the end-of-company tasks and notifications.
    const tenantLeases: { id: string; reference: string; property_name: string; city: string }[] = [];
    const upcomingSoon: { lease_id: string; title: string }[] = [];
    const rng = new Rng(`tenuro:${t.slug}`);
    const tx = seedText(t.region);
    const tenantId = stableId('tenant', t.slug);
    out.tenant.push({
      id: tenantId, slug: t.slug, name: t.name, name_local: t.nameLocal, locale: t.locale, languages: t.languages,
      reporting_currency: t.reportingCurrency, theme: JSON.stringify(t.theme), sort_order: tenantIndex,
    });

    // People ---------------------------------------------------------------
    const users: { id: string; role: string; name: string }[] = [];
    t.signInAccounts.forEach((p, i) => {
      const id = stableId('user', t.slug, 'account', p.role);
      users.push({ id, role: p.role, name: p.name });
      out.app_user.push({
        id, tenant_id: tenantId, email: `${p.role.toLowerCase()}@${t.emailDomain}`, display_name: p.name,
        job_title: p.title, role: p.role, locale: i === 2 && t.slug === 'mbuyu-court' ? 'sw' : null, listed_for_sign_in: true,
      });
    });
    const staffRng = rng.fork('staff');
    for (let i = 0; i < 9; i++) {
      const id = stableId('user', t.slug, 'staff', i);
      const name = personName(staffRng, t.region);
      const role = i < 7 ? 'MANAGER' : 'VIEWER';
      users.push({ id, role, name });
      out.app_user.push({
        id, tenant_id: tenantId, email: `staff${i + 1}@${t.emailDomain}`, display_name: name,
        job_title: staffRng.pick(t.staffTitles), role, locale: null, listed_for_sign_in: false,
      });
    }
    const managers = users.filter((u) => u.role !== 'VIEWER');
    const listedManager = users[1]!;
    const listedAdmin = users[0]!;

    // Properties -------------------------------------------------------------
    const leaseTarget = Math.round(t.leases * scale);
    const propRng = rng.fork('properties');
    const properties: PropertyPick[] = [];
    let unitTotal = 0;
    for (let p = 0; unitTotal < leaseTarget; p++) {
      const market = propRng.weighted(t.markets.map((m) => [m, m.weight] as const));
      const city = propRng.weighted(market.cities.map((c) => [c, c.weight] as const));
      const district = propRng.pick(city.districts);
      const type = propRng.pick(district.types);
      const [uMin, uMax] = UNITS_PER_PROPERTY[type];
      const units = Math.min(propRng.int(uMin, uMax), leaseTarget - unitTotal);
      unitTotal += units;
      const unitArea = drawArea(propRng, type);
      const street = STREET_PATTERNS[market.country]!(propRng.pick(t.region === 'GULF' ? GULF_ROOTS : t.region === 'EA' ? EA_ROOTS : EU_ROOTS), p);
      const photoRegion = t.region === 'EA' ? 'ea' : t.region === 'GULF' ? 'gulf' : 'eu';
      const row: Insertable<PropertyTable> = {
        id: stableId('property', t.slug, p),
        tenant_id: tenantId, sandbox_id: null,
        code: `${market.country}-${String(p + 1).padStart(4, '0')}`,
        name: buildingName(propRng, t, market, type),
        type,
        address_line: street,
        city: city.name,
        region: district.name,
        country_code: market.country,
        area_sqm: (unitArea * units * propRng.between(1.05, 1.4)).toFixed(2),
        year_built: propRng.int(1978, 2023),
        latitude: (district.lat + propRng.between(-0.012, 0.012)).toFixed(6),
        longitude: (district.lng + propRng.between(-0.012, 0.012)).toFixed(6),
        photo: `/static/photos/exteriors/${photoRegion}-${String(photoFor(type, t.region, p)).padStart(2, '0')}.jpg`,
        created_at: ts(addYears(today, -12)),
      };
      out.property.push(row);
      properties.push({ row, market, units, landlord: landlordName(propRng, t, market) });
    }

    // Leases -----------------------------------------------------------------
    const leaseRng = rng.fork('leases');
    let n = 0;
    for (const prop of properties) {
      const { market } = prop;
      const type = prop.row.type;
      for (let u = 0; u < prop.units; u++, n++) {
        const r = leaseRng.fork(`lease:${n}`);
        const leaseId = stableId('lease', t.slug, n);
        const termYears = r.pick(market.termYears[type]);
        const offsetMonths = r.int(-(termYears * 12 + 10), 4);
        const commencement = leaseStart(r, market.country, addMonths(today, offsetMonths).slice(0, 8) + '01');
        // Some terms run a few months past whole years (a fit-out period, or aligning to a quarter).
        const extraMonths = r.chance(0.18) ? r.pick([3, 6, 9]) : 0;
        const expiry = addDays(addMonths(addYears(commencement, termYears), extraMonths), -1);
        const currency = r.weighted(market.currencies);
        const frequency = r.weighted(market.frequency);
        const months = MONTHS_PER_PERIOD[frequency];
        const city = market.cities.find((c) => c.name === prop.row.city)!;
        const rateRange = currency === 'USD' && market.usdRent ? market.usdRent[type] : market.rent[type];
        const area = Math.round(drawArea(r, type));
        const ratePerSqmMonth = r.between(rateRange[0], rateRange[1]) * city.factor;
        const rentPerPeriod = niceRound(ratePerSqmMonth * area * months, currency);
        const [ibrMin, ibrMax] = market.ibr[currency] ?? [0.06, 0.08];
        const ibr = r.between(ibrMin, ibrMax).toFixed(4);

        let status: Insertable<LeaseTable>['status'] = 'ACTIVE';
        if (expiry < today) status = daysBetween(expiry, today) < 270 && r.chance(0.35) ? 'HOLDING_OVER' : 'EXPIRED';
        else if (commencement <= today && r.chance(0.02)) status = 'TERMINATED';

        // Escalation
        const escKind = r.weighted(market.escalation);
        const escalations: RentTerms['escalations'] = [];
        const steps: RentTerms['steps'] = [];
        if (escKind !== 'NONE') {
          const every = escKind === 'MARKET_REVIEW' ? market.reviewEveryMonths : escKind === 'CPI' ? 12 : market.reviewEveryMonths;
          const first = addMonths(commencement, every);
          const rate = escKind === 'FIXED' ? r.between(...market.fixedRate).toFixed(4) : null;
          escalations.push({ kind: escKind, rate, everyMonths: every, firstReviewOn: first, cap: escKind === 'CPI' ? '0.0400' : null, collar: escKind === 'CPI' ? '0.0100' : null });
          if (escKind !== 'FIXED') {
            let rent = rentPerPeriod;
            for (let d = first; d <= today && d <= expiry; d = addMonths(d, every)) {
              const uplift = escKind === 'CPI' ? r.between(0.012, 0.04) : r.between(0, 0.14);
              rent = niceRound(rent * (1 + uplift), currency);
              steps.push({ startsOn: d, rentPerPeriod: String(rent) });
            }
          }
        }
        const terms: RentTerms = {
          commencementDate: commencement, expiryDate: expiry, frequency, timing: market.timing,
          rentPerPeriod: String(rentPerPeriod), escalations, steps,
        };
        const annual = annualRent(terms, today, MINOR_UNITS[currency] ?? 2);

        // Parties
        const landlord = prop.landlord;
        const lessee = market.lesseeEntity;

        // Options
        const options: Insertable<LeaseOptionTable>[] = [];
        if (termYears >= 5 && r.chance(0.45)) {
          const breakOn = addYears(commencement, Math.floor(termYears / 2));
          const notice = addMonths(breakOn, -6);
          options.push({
            id: stableId('option', leaseId, 'break'), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId,
            kind: 'BREAK', exercise_on: breakOn, notice_by: notice, term_months: null, price: null,
            reasonably_certain: false, status: breakOn < today ? 'LAPSED' : 'OPEN',
            terms: tx.breakTerms,
          });
        }
        if (r.chance(0.7)) {
          const renewTerm = r.pick([36, 60, 60, 72]);
          options.push({
            id: stableId('option', leaseId, 'renewal'), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId,
            kind: 'RENEWAL', exercise_on: addDays(expiry, 1), notice_by: addMonths(expiry, -r.pick([6, 9, 12])),
            term_months: renewTerm, price: null, reasonably_certain: type === 'WAREHOUSE' && r.chance(0.3),
            status: expiry < today ? (status === 'HOLDING_OVER' ? 'OPEN' : r.pick(['EXERCISED', 'LAPSED'] as const)) : 'OPEN',
            terms: tx.renewTerms(renewTerm / 12),
          });
        }
        out.lease_option.push(...options);

        // Key dates
        const keyDates: { kind: KeyDateKind; due: IsoDate; title: string }[] = [];
        const relevant = expiry >= addMonths(today, -12) && status !== 'TERMINATED';
        if (relevant) {
          keyDates.push({ kind: 'EXPIRY', due: expiry, title: tx.keyDate.EXPIRY });
          for (const o of options) {
            const kind = o.kind === 'BREAK' ? 'BREAK_NOTICE' : 'RENEWAL_NOTICE';
            if (o.notice_by) keyDates.push({ kind, due: o.notice_by, title: tx.keyDate[kind] });
          }
          const nextReview = nextReviewOn(terms, addMonths(today, -6));
          if (nextReview) keyDates.push({ kind: 'RENT_REVIEW', due: nextReview, title: tx.keyDate.RENT_REVIEW });
          if (expiry < today) keyDates.push({ kind: 'DEPOSIT_RETURN', due: addDays(expiry, r.int(30, 75)), title: tx.keyDate.DEPOSIT_RETURN });
          if (r.chance(0.25)) keyDates.push({ kind: 'INSURANCE', due: addMonths(today, r.int(-3, 11)).slice(0, 8) + '01', title: tx.keyDate.INSURANCE });
        }
        const owner = r.pick(managers).id;
        let nextKey: { due: IsoDate; kind: KeyDateKind } | null = null;
        keyDates.forEach((k, i) => {
          const kdId = stableId('keydate', leaseId, i);
          const past = k.due < today;
          out.key_date.push({
            id: kdId, tenant_id: tenantId, sandbox_id: null, origin_id: null, deleted_at: null, lease_id: leaseId,
            kind: k.kind, due_on: k.due, title: k.title,
            // A few recent dates are still open past their due date: every real portfolio has some.
            // Slippage is mostly recent: the chance a date is still open falls away over about ten weeks.
            status: past ? (daysBetween(k.due, today) <= 70 && r.chance(0.12 * Math.exp(-daysBetween(k.due, today) / 18)) ? 'UPCOMING' : r.chance(0.92) ? 'ACTIONED' : 'DISMISSED') : 'UPCOMING',
            owner_id: owner, generated: true,
          });
          if (!past && (!nextKey || k.due < nextKey.due)) nextKey = { due: k.due, kind: k.kind };
          const daysOut = daysBetween(today, k.due);
          if (daysOut >= -20 && daysOut <= 120 && r.chance(0.72)) {
            const taskTitles: Record<KeyDateKind, string> = {
              ...tx.task,
              RENT_REVIEW: escKind === 'FIXED' ? tx.task.RENT_REVIEW_FIXED : tx.task.RENT_REVIEW,
            };
            const st: TaskStatus = daysOut < 0 ? r.weighted([['DONE', 55], ['IN_PROGRESS', 30], ['TODO', 15]] as const) : r.weighted([['TODO', 60], ['IN_PROGRESS', 35], ['DONE', 5]] as const);
            const created = addDays(k.due, -r.int(60, 150));
            out.task.push({
              id: stableId('task', kdId), tenant_id: tenantId, sandbox_id: null, origin_id: null, deleted_at: null,
              lease_id: leaseId, key_date_id: kdId, title: taskTitles[k.kind], description: null,
              assignee_id: r.chance(0.12) ? listedManager.id : owner,
              due_on: addDays(k.due, -r.int(7, 30)),
              priority: (daysOut < 30 ? r.weighted([['URGENT', 30], ['HIGH', 50], ['NORMAL', 20]] as const) : r.weighted([['HIGH', 30], ['NORMAL', 60], ['LOW', 10]] as const)) as TaskPriority,
              status: st, created_by: listedAdmin.id, created_at: ts(created < today ? created : today, 8),
              completed_at: st === 'DONE' ? ts(addDays(k.due, -r.int(1, 10)), 15) : null,
            });
          }
        });

        const lesseeRow = {
          id: leaseId, tenant_id: tenantId, sandbox_id: null, origin_id: null, deleted_at: null,
          reference: `${market.country}-${prop.row.type.slice(0, 1)}-${String(n + 1).padStart(5, '0')}`,
          status, property_id: prop.row.id!,
          premises: PREMISES[t.region === 'GULF' ? 'ar' : 'en']!(n, type),
          area_sqm: area, commencement_date: commencement, expiry_date: expiry,
          currency, payment_frequency: frequency, payment_timing: market.timing,
          rent_per_period: rentPerPeriod,
          service_charge_per_period: type === 'WAREHOUSE' || type === 'INDUSTRIAL' ? 0 : niceRound(rentPerPeriod * r.between(0.12, 0.22), currency),
          discount_rate: ibr,
          initial_direct_costs: r.chance(0.6) ? niceRound(rentPerPeriod * r.between(0.3, 1.2), currency) : 0,
          incentives: r.chance(0.35) ? niceRound(rentPerPeriod * r.between(0.5, 2), currency) : 0,
          prepayments: 0,
          restoration_cost: type === 'WAREHOUSE' || type === 'INDUSTRIAL' || r.chance(0.3) ? niceRound(area * ratePerSqmMonth * r.between(1, 3), currency) : 0,
          useful_life_months: null, ownership_transfers: false,
          standard: 'IFRS16' as const, asc842_class: null,
          exemption: termYears <= 1 ? ('SHORT_TERM' as const) : ('NONE' as const),
          cost_centre: `${market.country}-${type === 'OFFICE' ? 'ADM' : type === 'RETAIL' ? 'RTL' : 'OPS'}-${String(100 + (n % 40))}`,
          notes: null,
          country_code: market.country, city: prop.row.city, property_type: type, property_name: prop.row.name,
          landlord_name: landlord, lessee_entity: lessee,
          annual_rent: annual.toFixed(4),
          annual_rent_reporting: toReporting(annual, currency, t.reportingCurrency).toFixed(2),
          next_key_date: (nextKey as { due: IsoDate } | null)?.due ?? null,
          next_key_kind: (nextKey as { kind: KeyDateKind } | null)?.kind ?? null,
          created_by: listedAdmin.id, updated_by: listedAdmin.id,
          created_at: ts(addDays(commencement, -r.int(14, 60))), updated_at: ts(minIso(addDays(commencement, r.int(0, 400)), today)),
        } satisfies Insertable<LeaseTable>;
        out.lease.push(lesseeRow);

        // Live leases are measured now, so the portfolio's accounting adds up stored figures.
        if (status === 'ACTIVE' || status === 'HOLDING_OVER') {
          try {
            const acc = leaseAccounting(
              { ...lesseeRow, rent_per_period: String(rentPerPeriod) } as AccountingLease,
              steps.map((x) => ({ starts_on: x.startsOn, rent_per_period: x.rentPerPeriod })),
              escalations.map((x) => ({ kind: x.kind, rate: x.rate, every_months: x.everyMonths })),
              today,
            );
            const at = figuresAt(acc.schedule, today);
            const year = yearTotals(acc.schedule, Number(today.slice(0, 4)));
            const band = (k: string) => at.maturity.bands.find((b) => b.key === k)?.amount ?? '0';
            const rf = rollForward(acc.schedule, today);
            // Under IFRS 16 there is no operating lease cost: only exempt leases (and ASC 842 operating leases) have one.
            const expensed = acc.schedule.input.standard === 'ASC842_OPERATING' || lesseeRow.exemption !== 'NONE';
            out.lease_accounting.push({
              lease_row_id: leaseId, tenant_id: tenantId, measured_as: acc.schedule.input.standard, currency, as_of: today,
              liability: at.liability, rou: at.rou, interest_year: year.interest, depreciation_year: year.depreciation,
              lease_cost_year: expensed ? year.leaseCost : '0', cash_year: year.cashPaid,
              exempt: lesseeRow.exemption !== 'NONE',
              liability_open: rf.open, additions_ytd: rf.additions, interest_ytd: rf.interest, payments_ytd: rf.payments,
              remeasure_ytd: rf.remeasure, liability_close: rf.close,
              monthly_interest: rf.monthlyInterest, monthly_depreciation: rf.monthlyDepreciation, monthly_cost: expensed ? rf.monthlyCost : rf.monthlyCost.map(() => '0'),
              within_1_year: band('WITHIN_1_YEAR'), year_1_to_2: band('YEAR_1_TO_2'), year_2_to_3: band('YEAR_2_TO_3'),
              year_3_to_4: band('YEAR_3_TO_4'), year_4_to_5: band('YEAR_4_TO_5'), after_5_years: band('AFTER_5_YEARS'),
            });
          } catch {
            // A lease the engine cannot measure is left out of the totals, as the API leaves it out of the lease page.
          }
        }

        escalations.forEach((e, i) => out.escalation.push({
          id: stableId('esc', leaseId, i), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId,
          kind: e.kind, rate: e.rate, index_name: e.kind === 'CPI' ? (market.country === 'GB' ? 'UK CPI' : 'HICP (euro area)') : null,
          cap: e.cap, collar: e.collar, every_months: e.everyMonths, first_review_on: e.firstReviewOn,
        }));
        steps.forEach((s, i) => out.rent_step.push({
          id: stableId('step', leaseId, i), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId,
          starts_on: s.startsOn, rent_per_period: s.rentPerPeriod,
        }));

        out.lease_party.push(
          { id: stableId('party', leaseId, 'landlord'), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId, role: 'LANDLORD',
            name: landlord, contact_name: personName(r, t.region), email: `leasing@${landlordSlug(landlord, n)}.example`,
            phone: null, address: `${prop.row.address_line}, ${prop.row.city}`, position: 0 },
          { id: stableId('party', leaseId, 'lessee'), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId, role: 'LESSEE_ENTITY',
            name: lessee, contact_name: users.find((x) => x.id === owner)?.name ?? null, email: null, phone: null, address: null, position: 1 },
        );
        if (r.chance(0.25)) out.lease_party.push({
          id: stableId('party', leaseId, 'agent'), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId, role: 'AGENT',
          name: landlordName(r, t, market).replace(/(Properties|Investments|Estates|Holdings|Developers|Land|Immobilien|Vastgoed|Immobilier)/, 'Advisory'),
          contact_name: personName(r, t.region), email: null, phone: null, address: null, position: 2,
        });

        const depositMonths = market.depositMonths;
        out.deposit.push({
          id: stableId('deposit', leaseId), tenant_id: tenantId, sandbox_id: null, lease_row_id: leaseId,
          kind: market.country === 'NL' || market.country === 'DE' || market.country === 'FR' ? 'BANK_GUARANTEE' : 'CASH',
          amount: niceRound((rentPerPeriod / months) * depositMonths, currency), currency, held_by: landlord,
          return_due_on: addDays(expiry, 60),
          status: status === 'EXPIRED' ? r.weighted([['RETURNED', 70], ['PARTLY_RETURNED', 15], ['HELD', 15]] as const) : 'HELD',
        });

        // Documents
        out.document.push({
          id: stableId('doc', leaseId, 'lease'), tenant_id: tenantId, sandbox_id: null, lease_id: leaseId, kind: 'LEASE',
          title: t.region === 'GULF' ? 'عقد الإيجار' : 'Lease agreement',
          filename: `${lesseeRow.reference}-lease.html`, mime_type: 'text/html', size_bytes: r.int(9_000, 14_000),
          page_count: null, template: 'lease-agreement', content: null, uploaded_by: listedAdmin.id, created_at: ts(commencement, 10),
        });
        if (steps.length && r.chance(0.6)) out.document.push({
          id: stableId('doc', leaseId, 'memo'), tenant_id: tenantId, sandbox_id: null, lease_id: leaseId, kind: 'AMENDMENT',
          title: t.region === 'GULF' ? 'مذكرة مراجعة الإيجار' : 'Rent review memorandum',
          filename: `${lesseeRow.reference}-rent-review.html`, mime_type: 'text/html', size_bytes: r.int(4_000, 6_000),
          page_count: null, template: 'rent-review-memo', content: null, uploaded_by: owner, created_at: ts(steps.at(-1)!.startsOn, 11),
        });
        // Every lease has its demise plan attached.
        out.document.push({
          id: stableId('doc', leaseId, 'plan'), tenant_id: tenantId, sandbox_id: null, lease_id: leaseId, kind: 'FLOOR_PLAN',
          title: t.region === 'GULF' ? 'مخطط المساحة المؤجرة' : 'Demise plan',
          filename: `${lesseeRow.reference}-plan.svg`, mime_type: 'image/svg+xml', size_bytes: r.int(2_000, 3_000),
          page_count: 1, template: 'floor-plan', content: null, uploaded_by: owner, created_at: ts(commencement, 12),
        });
        if (r.chance(0.3)) out.document.push({
          id: stableId('doc', leaseId, 'photo'), tenant_id: tenantId, sandbox_id: null, lease_id: leaseId, kind: 'PHOTO',
          title: t.region === 'GULF' ? 'صورة المبنى' : 'Building exterior',
          filename: `${lesseeRow.reference}-exterior.jpg`, mime_type: 'image/jpeg', size_bytes: r.int(400_000, 900_000),
          page_count: null, template: `photo:${prop.row.photo}`, content: null, uploaded_by: owner, created_at: ts(commencement, 13),
        });

        // Activity
        // Events in the last 45 days are thinned in proportion to the portfolio, so the overview's
        // recent activity reads as a few weeks of a team's work rather than one busy morning.
        // System events (indexation, holding over, expiry) have no person as actor.
        const recentKeep = Math.min(1, 60 / leaseTarget);
        // weight < 1 thins a routine kind of event further, so the feed mixes what people did.
        const act = (key: string, on: IsoDate, verb: string, summary: string, actor: string | null, diff: unknown = null, weight = 1) => {
          if (on > today) return;
          if (daysBetween(on, today) <= 45 && !r.chance(recentKeep * weight)) return;
          out.activity.push({
            id: stableId('activity', leaseId, key), tenant_id: tenantId, sandbox_id: null, lease_id: leaseId, actor_id: actor,
            verb, summary, diff: diff ? JSON.stringify(diff) : null, created_at: ts(on, r.int(7, 17), r.int(0, 59)),
          });
        };
        // Leases are entered by whoever on the team handles them, not always the admin.
        act('created', addDays(commencement, -r.int(14, 60)), 'LEASE_CREATED', tx.activity.created(lesseeRow.reference), r.chance(0.3) ? listedAdmin.id : r.pick(managers).id, null, 0.4);
        act('signed', commencement, 'DOCUMENT_ADDED', tx.activity.signed, owner, null, 0.5);
        steps.forEach((s, i) => act(`step${i}`, escKind === 'CPI' ? s.startsOn : addDays(s.startsOn, r.int(5, 40)), 'RENT_CHANGED',
          escKind === 'CPI' ? tx.activity.indexation : r.chance(0.5) ? tx.activity.review : tx.activity.reviewAgreed,
          escKind === 'CPI' ? null : owner, [{ field: 'rent.rentPerPeriod', from: i === 0 ? String(rentPerPeriod) : steps[i - 1]!.rentPerPeriod, to: s.rentPerPeriod }], escKind === 'CPI' ? 0.35 : 1));
        for (const o of options) {
          if (!o.notice_by || o.notice_by >= today) continue;
          if (o.kind === 'RENEWAL' && o.status === 'EXERCISED') act('renewal-served', addDays(o.notice_by, -r.int(3, 40)), 'NOTICE_SERVED', tx.activity.renewalServed, owner);
          if (o.kind === 'BREAK' && o.status === 'LAPSED') act('break-declined', addDays(o.notice_by, -r.int(1, 25)), 'DECISION_RECORDED', tx.activity.breakDeclined, owner);
        }
        for (const k of keyDates) if (k.kind === 'INSURANCE' && k.due < today) act('insurance', addDays(k.due, -r.int(0, 12)), 'DOCUMENT_ADDED', tx.activity.insuranceUploaded, owner);
        if (status === 'HOLDING_OVER') act('holding', addDays(expiry, 1), 'STATUS_CHANGED', tx.activity.holding, null, [{ field: 'status', from: 'ACTIVE', to: 'HOLDING_OVER' }]);
        if (status === 'EXPIRED') act('expired', addDays(expiry, 1), 'STATUS_CHANGED', tx.activity.expired, null, [{ field: 'status', from: 'ACTIVE', to: 'EXPIRED' }]);
        // Terminated some time between commencement and today (not clamped to today, which piled
        // every recent termination onto the day of the rebuild).
        const terminatedOn = addMonths(commencement, r.int(12, 40));
        if (status === 'TERMINATED') act('terminated', terminatedOn < today ? terminatedOn : addDays(commencement, r.int(1, Math.max(1, daysBetween(commencement, today) - 1))), 'STATUS_CHANGED', tx.activity.terminated, listedAdmin.id, [{ field: 'status', from: 'ACTIVE', to: 'TERMINATED' }]);

        tenantLeases.push({ id: leaseId, reference: lesseeRow.reference, property_name: lesseeRow.property_name, city: lesseeRow.city });
        for (const k of keyDates) {
          if (k.due >= today && k.due <= addDays(today, 30)) upcomingSoon.push({ lease_id: leaseId, title: k.title });
        }
      }
      if (out.lease.length >= batchLeases) {
        yield out;
        out = emptySeed();
      }
    }

    // A few portfolio tasks that are not tied to a key date
    const taskRng = rng.fork('tasks');
    const general = t.region === 'GULF'
      ? ['مطابقة فواتير رسوم الخدمات', 'تحميل النسخة الموقعة من العقد', 'تأكيد بيانات الحساب البنكي للمؤجر', 'مراجعة شروط الصيانة']
      : ['Reconcile the service charge statement', 'Upload the signed counterpart', 'Confirm landlord bank details', 'Review repair obligations before handback', 'Check the insurance schedule'];
    const leaseCount = tenantLeases.length;
    for (let i = 0; i < Math.round(leaseCount / 25); i++) {
      const lease = tenantLeases[taskRng.int(0, leaseCount - 1)]!;
      const st = taskRng.weighted([['TODO', 40], ['IN_PROGRESS', 25], ['DONE', 35]] as const);
      const due = addDays(today, taskRng.int(-45, 75));
      out.task.push({
        id: stableId('task', t.slug, 'general', i), tenant_id: tenantId, sandbox_id: null, origin_id: null, deleted_at: null,
        lease_id: lease.id!, key_date_id: null, title: taskRng.pick(general), description: null,
        assignee_id: taskRng.chance(0.15) ? listedManager.id : taskRng.pick(managers).id, due_on: due,
        priority: taskRng.weighted([['LOW', 15], ['NORMAL', 60], ['HIGH', 25]] as const), status: st,
        created_by: listedAdmin.id, created_at: ts(addDays(due, -taskRng.int(10, 40)) < today ? addDays(due, -taskRng.int(10, 40)) : today, 8),
        completed_at: st === 'DONE' ? ts(minIso(due, today), 16) : null,
      });
    }

    // Shared saved views
    const views: [string, string, Record<string, unknown>][] = t.region === 'GULF'
      ? [['active', 'العقود السارية', { filters: { status: ['ACTIVE'] }, sort: [{ field: 'EXPIRY_DATE', direction: 'ASC' }] }],
         ['expiring', 'تنتهي خلال 12 شهراً', { filters: { status: ['ACTIVE'], expiresWithinDays: 365 }, sort: [{ field: 'EXPIRY_DATE', direction: 'ASC' }] }],
         ['holding', 'عقود ممتدة بعد الانتهاء', { filters: { status: ['HOLDING_OVER'] }, sort: [{ field: 'ANNUAL_RENT', direction: 'DESC' }] }]]
      : [['active', 'Active leases', { filters: { status: ['ACTIVE'] }, sort: [{ field: 'EXPIRY_DATE', direction: 'ASC' }] }],
         ['expiring', 'Expiring in 12 months', { filters: { status: ['ACTIVE'], expiresWithinDays: 365 }, sort: [{ field: 'EXPIRY_DATE', direction: 'ASC' }] }],
         ['holding', 'Holding over', { filters: { status: ['HOLDING_OVER'] }, sort: [{ field: 'ANNUAL_RENT', direction: 'DESC' }] }],
         ['logistics', 'Logistics estate', { filters: { propertyType: ['WAREHOUSE', 'INDUSTRIAL'] }, sort: [{ field: 'ANNUAL_RENT', direction: 'DESC' }] }]];
    views.forEach(([key, name, config], i) => out.saved_view.push({
      id: stableId('view', t.slug, key), tenant_id: tenantId, sandbox_id: null, origin_id: null, deleted_at: null,
      owner_id: null, scope: 'LEASE_REGISTER', name, config: JSON.stringify(config), position: i, created_at: ts(addYears(today, -1)),
    }));

    // Notifications for the people on the sign-in page
    const notifRng = rng.fork('notifications');
    const leaseById = new Map(tenantLeases.map((l) => [l.id, l]));
    for (const listedUser of users.slice(0, 3)) {
      for (let i = 0; i < 8 && upcomingSoon.length; i++) {
        const k = notifRng.pick(upcomingSoon);
        const lease = leaseById.get(k.lease_id)!;
        out.notification.push({
          id: stableId('notif', listedUser.id, i), tenant_id: tenantId, sandbox_id: null, user_id: listedUser.id,
          kind: 'KEY_DATE_DUE', title: `${k.title}: ${lease.reference}`, body: `${lease.property_name}, ${lease.city}`,
          link: `/leases/${lease.id}`, read_at: i > 3 ? ts(addDays(today, -1)) : null, created_at: ts(addDays(today, -notifRng.int(0, 6)), notifRng.int(6, 18)),
        });
      }
    }
    yield out;
    out = emptySeed();
  }
}

const minIso = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

// Each region has 8 exteriors: offices first, then retail frontage, then logistics (Europe has a
// fourth office). A property only ever gets a photo of its own kind.
function photoFor(type: PropertyType, region: TenantSeed['region'], n: number): number {
  const sets = region === 'EU'
    ? { office: [1, 2, 3, 4], retail: [5, 6], logistics: [7, 8] }
    : { office: [1, 2, 3], retail: [4, 5, 6], logistics: [7, 8] };
  const list = type === 'RETAIL' ? sets.retail : type === 'WAREHOUSE' || type === 'INDUSTRIAL' ? sets.logistics : sets.office;
  return list[n % list.length]!;
}
const landlordSlug = (name: string, n: number) =>
  /^[\x00-\x7F]+$/.test(name) ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : `landlord-${n}`;
