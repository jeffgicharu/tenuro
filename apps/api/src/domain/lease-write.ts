import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { sql, type Insertable, type Selectable } from 'kysely';
import { emptyParty, type LeaseFormData } from '@tenuro/lease-rules';
import type {
  DepositTable, EscalationTable, KeyDateKind, LeaseOptionTable, LeasePartyTable, LeaseStatus, LeaseTable, PropertyTable, RentStepTable,
} from '../db/types.ts';
import type { Context } from '../graphql/context.ts';
import type { LeaseRow } from '../graphql/types/lease-shape.ts';
import { MINOR_UNITS, PER_USD } from '../seed/markets.ts';
import { addDays, addMonths } from './dates.ts';
import { annualRent, nextReviewOn, type RentTerms } from './rent.ts';

const pct = (v: string) => (v.trim() ? new Decimal(v).div(100).toDecimalPlaces(6).toString() : null);
const toPct = (v: string | null) => (v === null ? '' : new Decimal(v).mul(100).toDecimalPlaces(4).toString());
const dec = (v: string) => (v.trim() ? v.trim() : '0');
const opt = (v: string) => (v.trim() ? v.trim() : null);
const trimDec = (v: string | null | undefined) => (v == null ? '' : new Decimal(v).toString());

export interface LeaseChildren {
  parties: Selectable<LeasePartyTable>[];
  steps: Selectable<RentStepTable>[];
  escalations: Selectable<EscalationTable>[];
  options: Selectable<LeaseOptionTable>[];
  deposits: Selectable<DepositTable>[];
}

export async function loadChildren(ctx: Context, leaseRowId: string): Promise<LeaseChildren> {
  const [parties, steps, escalations, options, deposits] = await Promise.all([
    ctx.loaders.parties.load(leaseRowId), ctx.loaders.rentSteps.load(leaseRowId), ctx.loaders.escalations.load(leaseRowId),
    ctx.loaders.options.load(leaseRowId), ctx.loaders.deposits.load(leaseRowId),
  ]);
  return { parties, steps, escalations, options, deposits };
}

// The exact inverse of formToRows, so an amendment starts from what is stored.
export function leaseToForm(l: LeaseRow, c: LeaseChildren, propertyGlobalId: string): LeaseFormData {
  const party = (role: Selectable<LeasePartyTable>['role']) => {
    const p = c.parties.find((x) => x.role === role);
    return p ? { name: p.name, contactName: p.contact_name ?? '', email: p.email ?? '', phone: p.phone ?? '' } : null;
  };
  const e = c.escalations[0];
  return {
    parties: {
      landlord: party('LANDLORD') ?? emptyParty(),
      lesseeEntity: l.lessee_entity,
      guarantor: party('GUARANTOR'),
      agent: party('AGENT'),
    },
    property: { propertyId: propertyGlobalId, premises: l.premises, areaSqm: trimDec(l.area_sqm) },
    term: { commencementDate: l.commencement_date, expiryDate: l.expiry_date },
    rent: {
      currency: l.currency, paymentFrequency: l.payment_frequency, paymentTiming: l.payment_timing,
      rentPerPeriod: trimDec(l.rent_per_period), serviceChargePerPeriod: trimDec(l.service_charge_per_period) === '0' ? '' : trimDec(l.service_charge_per_period),
      escalation: e
        ? { kind: e.kind, ratePercent: toPct(e.rate), everyMonths: String(e.every_months), firstReviewOn: e.first_review_on,
            indexName: e.index_name ?? '', capPercent: toPct(e.cap), collarPercent: toPct(e.collar) }
        : { kind: 'NONE', ratePercent: '', everyMonths: '12', firstReviewOn: '', indexName: '', capPercent: '', collarPercent: '' },
      steps: c.steps.map((s) => ({ startsOn: s.starts_on, rentPerPeriod: trimDec(s.rent_per_period) })),
    },
    options: c.options.map((o) => ({
      kind: o.kind, exerciseOn: o.exercise_on, noticeBy: o.notice_by ?? '', termMonths: o.term_months?.toString() ?? '',
      price: trimDec(o.price), reasonablyCertain: o.reasonably_certain, terms: o.terms ?? '',
    })),
    deposits: c.deposits.map((d) => ({ kind: d.kind, amount: trimDec(d.amount), heldBy: d.held_by, returnDueOn: d.return_due_on ?? '' })),
    accounting: {
      discountRatePercent: toPct(l.discount_rate),
      initialDirectCosts: zeroToBlank(l.initial_direct_costs), incentives: zeroToBlank(l.incentives),
      prepayments: zeroToBlank(l.prepayments), restorationCost: zeroToBlank(l.restoration_cost),
      usefulLifeMonths: l.useful_life_months?.toString() ?? '', ownershipTransfers: l.ownership_transfers,
      standard: l.standard, asc842Class: l.asc842_class ?? '', exemption: l.exemption, costCentre: l.cost_centre ?? '',
    },
    notes: l.notes ?? '',
  };
}

const zeroToBlank = (v: string) => (new Decimal(v).isZero() ? '' : new Decimal(v).toString());

export function statusFor(today: string, end: string, current?: LeaseStatus): LeaseStatus {
  if (current === 'TERMINATED') return current;
  if (end < today) return current === 'HOLDING_OVER' ? 'HOLDING_OVER' : 'EXPIRED';
  return 'ACTIVE';
}

export function rentTermsFromForm(f: LeaseFormData): RentTerms {
  const e = f.rent.escalation;
  return {
    commencementDate: f.term.commencementDate, expiryDate: f.term.expiryDate,
    frequency: f.rent.paymentFrequency, timing: f.rent.paymentTiming, rentPerPeriod: f.rent.rentPerPeriod,
    escalations: e.kind === 'NONE' ? [] : [{
      kind: e.kind, rate: pct(e.ratePercent), everyMonths: Number(e.everyMonths), firstReviewOn: e.firstReviewOn,
      cap: pct(e.capPercent), collar: pct(e.collarPercent),
    }],
    steps: f.rent.steps.map((s) => ({ startsOn: s.startsOn, rentPerPeriod: s.rentPerPeriod })),
  };
}

interface WriteTarget {
  rowId: string;
  tenantId: string;
  sandboxId: string | null;
  reportingCurrency: string;
  property: Selectable<PropertyTable>;
  userId: string;
  today: string;
}

export function leaseColumns(f: LeaseFormData, t: WriteTarget) {
  const terms = rentTermsFromForm(f);
  const annual = annualRent(terms, t.today, MINOR_UNITS[f.rent.currency] ?? 2);
  const reporting = annual.div(PER_USD[f.rent.currency] ?? 1).mul(PER_USD[t.reportingCurrency] ?? 1).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const a = f.accounting;
  return {
    property_id: t.property.id,
    premises: f.property.premises.trim(),
    area_sqm: f.property.areaSqm.trim(),
    commencement_date: f.term.commencementDate,
    expiry_date: f.term.expiryDate,
    currency: f.rent.currency,
    payment_frequency: f.rent.paymentFrequency,
    payment_timing: f.rent.paymentTiming,
    rent_per_period: f.rent.rentPerPeriod.trim(),
    service_charge_per_period: dec(f.rent.serviceChargePerPeriod),
    discount_rate: pct(a.discountRatePercent)!,
    initial_direct_costs: dec(a.initialDirectCosts),
    incentives: dec(a.incentives),
    prepayments: dec(a.prepayments),
    restoration_cost: dec(a.restorationCost),
    useful_life_months: a.usefulLifeMonths.trim() ? Number(a.usefulLifeMonths) : null,
    ownership_transfers: a.ownershipTransfers,
    standard: a.standard,
    asc842_class: a.standard === 'ASC842' && a.asc842Class ? a.asc842Class : null,
    exemption: a.exemption,
    cost_centre: opt(a.costCentre),
    notes: opt(f.notes),
    country_code: t.property.country_code,
    city: t.property.city,
    property_type: t.property.type,
    property_name: t.property.name,
    landlord_name: f.parties.landlord.name.trim(),
    lessee_entity: f.parties.lesseeEntity.trim(),
    annual_rent: annual.toFixed(4),
    annual_rent_reporting: reporting.toFixed(2),
    updated_by: t.userId,
    updated_at: sql<Date>`now()` as unknown as Date,
  } satisfies Partial<Insertable<LeaseTable>>;
}

export async function insertChildren(ctx: Context, f: LeaseFormData, t: WriteTarget): Promise<number> {
  const scope = { tenant_id: t.tenantId, sandbox_id: t.sandboxId, lease_row_id: t.rowId };
  const parties: Insertable<LeasePartyTable>[] = [];
  const party = (role: Insertable<LeasePartyTable>['role'], p: { name: string; contactName: string; email: string; phone: string }, position: number) =>
    parties.push({ id: randomUUID(), ...scope, role, name: p.name.trim(), contact_name: opt(p.contactName), email: opt(p.email), phone: opt(p.phone), address: null, position });
  party('LANDLORD', f.parties.landlord, 0);
  party('LESSEE_ENTITY', { name: f.parties.lesseeEntity, contactName: '', email: '', phone: '' }, 1);
  if (f.parties.guarantor) party('GUARANTOR', f.parties.guarantor, 2);
  if (f.parties.agent) party('AGENT', f.parties.agent, 3);

  const e = f.rent.escalation;
  const escalations: Insertable<EscalationTable>[] = e.kind === 'NONE' ? [] : [{
    id: randomUUID(), ...scope, kind: e.kind, rate: e.kind === 'FIXED' ? pct(e.ratePercent) : null,
    index_name: e.kind === 'CPI' ? opt(e.indexName) : null, cap: e.kind === 'CPI' ? pct(e.capPercent) : null,
    collar: e.kind === 'CPI' ? pct(e.collarPercent) : null, every_months: Number(e.everyMonths), first_review_on: e.firstReviewOn,
  }];
  const steps: Insertable<RentStepTable>[] = f.rent.steps.map((s) => ({ id: randomUUID(), ...scope, starts_on: s.startsOn, rent_per_period: s.rentPerPeriod.trim() }));
  const options: Insertable<LeaseOptionTable>[] = f.options.map((o) => ({
    id: randomUUID(), ...scope, kind: o.kind, exercise_on: o.exerciseOn, notice_by: o.noticeBy || null,
    term_months: o.kind === 'RENEWAL' ? Number(o.termMonths) : null, price: o.kind === 'PURCHASE' ? o.price.trim() : null,
    reasonably_certain: o.reasonablyCertain, status: o.exerciseOn < t.today ? 'LAPSED' : 'OPEN', terms: opt(o.terms),
  }));
  const deposits: Insertable<DepositTable>[] = f.deposits.map((d) => ({
    id: randomUUID(), ...scope, kind: d.kind, amount: d.amount.trim(), currency: f.rent.currency, held_by: d.heldBy.trim(),
    return_due_on: d.returnDueOn || null, status: 'HELD',
  }));
  if (parties.length) await ctx.tx.insertInto('lease_party').values(parties).execute();
  if (escalations.length) await ctx.tx.insertInto('escalation').values(escalations).execute();
  if (steps.length) await ctx.tx.insertInto('rent_step').values(steps).execute();
  if (options.length) await ctx.tx.insertInto('lease_option').values(options).execute();
  if (deposits.length) await ctx.tx.insertInto('deposit').values(deposits).execute();
  return parties.length + escalations.length + steps.length + options.length + deposits.length;
}

export async function deleteChildren(ctx: Context, rowId: string): Promise<void> {
  for (const table of ['lease_party', 'escalation', 'rent_step', 'lease_option', 'deposit'] as const) {
    await ctx.tx.deleteFrom(table).where('lease_row_id', '=', rowId).execute();
  }
}

export function generatedKeyDates(f: LeaseFormData, today: string): { kind: KeyDateKind; due: string; title: string }[] {
  const out: { kind: KeyDateKind; due: string; title: string }[] = [{ kind: 'EXPIRY', due: f.term.expiryDate, title: 'Lease expiry' }];
  for (const o of f.options) {
    if (!o.noticeBy || o.kind === 'PURCHASE') continue;
    out.push({ kind: o.kind === 'BREAK' ? 'BREAK_NOTICE' : 'RENEWAL_NOTICE', due: o.noticeBy, title: o.kind === 'BREAK' ? 'Break notice deadline' : 'Renewal notice deadline' });
  }
  const review = nextReviewOn(rentTermsFromForm(f), addDays(today, -1));
  const kind = f.rent.escalation.kind;
  if (review) out.push({ kind: 'RENT_REVIEW', due: review, title: kind === 'FIXED' ? 'Fixed rent uplift' : kind === 'CPI' ? 'Indexation review' : 'Rent review' });
  for (const d of f.deposits) {
    out.push({ kind: 'DEPOSIT_RETURN', due: d.returnDueOn || addMonths(f.term.expiryDate, 2), title: 'Deposit return due' });
  }
  return out.filter((k) => k.due >= today);
}

// Replaces the generated key dates of a lease. In a sandbox, base rows are hidden with tombstones
// rather than deleted, and the visitor's own rows are soft-deleted so a hidden base row stays hidden.
export async function replaceKeyDates(ctx: Context, leaseId: string, f: LeaseFormData, ownerId: string, tenantId: string): Promise<{ next: { due: string; kind: KeyDateKind } | null; rows: number }> {
  const sandboxId = ctx.session?.sandboxId ?? null;
  const existing = await ctx.tx.selectFrom('v_key_date').selectAll().where('lease_id', '=', leaseId).where('generated', '=', true).execute();
  let rows = 0;
  for (const k of existing) {
    if (k.sandbox_id === sandboxId && sandboxId !== null) {
      await ctx.tx.updateTable('key_date').set({ deleted_at: sql<Date>`now()` as unknown as Date }).where('id', '=', k.id).execute();
    } else if (sandboxId !== null) {
      await ctx.tx.insertInto('key_date').values({
        id: randomUUID(), tenant_id: tenantId, sandbox_id: sandboxId, origin_id: k.id, deleted_at: sql<Date>`now()` as unknown as Date,
        lease_id: leaseId, kind: k.kind, due_on: k.due_on, title: k.title, status: k.status, owner_id: k.owner_id, generated: true,
      }).execute();
      rows++;
    } else {
      await ctx.tx.deleteFrom('key_date').where('id', '=', k.id).execute();
    }
  }
  const fresh = generatedKeyDates(f, ctx.today);
  if (fresh.length) {
    await ctx.tx.insertInto('key_date').values(fresh.map((k) => ({
      id: randomUUID(), tenant_id: tenantId, sandbox_id: sandboxId, origin_id: null, deleted_at: null,
      lease_id: leaseId, kind: k.kind, due_on: k.due, title: k.title, status: 'UPCOMING' as const, owner_id: ownerId, generated: true,
    }))).execute();
    rows += fresh.length;
  }
  const next = fresh.reduce<{ due: string; kind: KeyDateKind } | null>((m, k) => (!m || k.due < m.due ? { due: k.due, kind: k.kind } : m), null);
  return { next, rows };
}

// Field-level differences between two versions of the form, for the activity log.
export function diffForms(before: LeaseFormData, after: LeaseFormData): { field: string; from: string; to: string }[] {
  const flat = (o: unknown, prefix = '', out: Record<string, string> = {}) => {
    if (o === null || typeof o !== 'object') {
      out[prefix] = o === null || o === undefined ? '' : String(o);
      return out;
    }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) flat(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  };
  const a = flat(before);
  const b = flat(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => (a[k] ?? '') !== (b[k] ?? '')).map((k) => ({ field: k, from: a[k] ?? '', to: b[k] ?? '' })).slice(0, 60);
}
