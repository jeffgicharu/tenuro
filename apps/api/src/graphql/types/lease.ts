import { resolveArrayConnection } from '@pothos/plugin-relay';
import type { Selectable } from 'kysely';
import type {
  DepositTable, EscalationTable, LeaseOptionTable, LeasePartyTable, PropertyTable, RentStepTable,
} from '../../db/types.ts';
import { daysBetween, monthsBetween } from '../../domain/dates.ts';
import { MINOR_UNITS } from '../../seed/markets.ts';
import { rentSchedule, type RentPeriod, type RentTerms } from '../../domain/rent.ts';
import { builder } from '../builder.ts';
import type { Context } from '../context.ts';
import {
  AccountingStandardEnum, Asc842ClassEnum, DepositKindEnum, DepositStatusEnum, EscalationKindEnum, KeyDateKindEnum,
  LeaseExemptionEnum, LeaseStatusEnum, Money, money, OptionKindEnum, OptionStatusEnum, PartyRoleEnum, PaymentFrequencyEnum,
  PaymentTimingEnum, PropertyTypeEnum,
} from './common.ts';
import type { LeaseRow } from './lease-shape.ts';
import { User } from './tenant.ts';
import { optionStatus } from '../../domain/options.ts';

type PropertyRow = Selectable<PropertyTable>;

export const Property = builder.node(builder.objectRef<PropertyRow>('Property'), {
  id: { resolve: (p) => p.id },
  loadMany: (ids, ctx) => ctx.loaders.property.loadMany(ids).then((rows) => rows.map((r) => (r instanceof Error ? null : r))),
  fields: (t) => ({
    code: t.exposeString('code'),
    name: t.exposeString('name'),
    type: t.field({ type: PropertyTypeEnum, resolve: (p) => p.type }),
    addressLine: t.exposeString('address_line'),
    city: t.exposeString('city'),
    district: t.exposeString('region', { nullable: true }),
    countryCode: t.field({ type: 'CountryCode', resolve: (p) => p.country_code }),
    areaSqm: t.field({ type: 'Decimal', resolve: (p) => p.area_sqm }),
    yearBuilt: t.exposeInt('year_built', { nullable: true }),
    latitude: t.field({ type: 'Decimal', nullable: true, resolve: (p) => p.latitude }),
    longitude: t.field({ type: 'Decimal', nullable: true, resolve: (p) => p.longitude }),
    photo: t.exposeString('photo', { nullable: true }),
  }),
});

export const LeaseParty = builder.objectRef<Selectable<LeasePartyTable>>('LeaseParty').implement({
  fields: (t) => ({
    role: t.field({ type: PartyRoleEnum, resolve: (p) => p.role }),
    name: t.exposeString('name'),
    contactName: t.exposeString('contact_name', { nullable: true }),
    email: t.exposeString('email', { nullable: true }),
    phone: t.exposeString('phone', { nullable: true }),
    address: t.exposeString('address', { nullable: true }),
  }),
});

const leaseCurrency = (ctx: Context, leaseRowId: string) =>
  ctx.loaders.leaseByRow.load(leaseRowId).then((l) => l?.currency ?? 'USD');

export const RentStep = builder.objectRef<Selectable<RentStepTable>>('RentStep').implement({
  description: 'A settled rent change, such as an agreed market review or applied indexation.',
  fields: (t) => ({
    startsOn: t.field({ type: 'Date', resolve: (s) => s.starts_on }),
    rentPerPeriod: t.field({ type: Money, resolve: async (s, _a, ctx) => money(s.rent_per_period, await leaseCurrency(ctx, s.lease_row_id)) }),
  }),
});

export const Escalation = builder.objectRef<Selectable<EscalationTable>>('Escalation').implement({
  fields: (t) => ({
    kind: t.field({ type: EscalationKindEnum, resolve: (e) => e.kind }),
    rate: t.field({ type: 'Decimal', nullable: true, description: 'Fixed uplift as a fraction, e.g. 0.05 for 5%.', resolve: (e) => e.rate }),
    indexName: t.exposeString('index_name', { nullable: true }),
    cap: t.field({ type: 'Decimal', nullable: true, resolve: (e) => e.cap }),
    collar: t.field({ type: 'Decimal', nullable: true, resolve: (e) => e.collar }),
    everyMonths: t.exposeInt('every_months'),
    firstReviewOn: t.field({ type: 'Date', resolve: (e) => e.first_review_on }),
  }),
});

export const LeaseOption = builder.objectRef<Selectable<LeaseOptionTable>>('LeaseOption').implement({
  fields: (t) => ({
    kind: t.field({ type: OptionKindEnum, resolve: (o) => o.kind }),
    exerciseOn: t.field({ type: 'Date', resolve: (o) => o.exercise_on }),
    noticeBy: t.field({ type: 'Date', nullable: true, resolve: (o) => o.notice_by }),
    termMonths: t.exposeInt('term_months', { nullable: true }),
    price: t.field({ type: Money, nullable: true, resolve: async (o, _a, ctx) => (o.price ? money(o.price, await leaseCurrency(ctx, o.lease_row_id)) : null) }),
    reasonablyCertain: t.exposeBoolean('reasonably_certain', { description: 'Whether the lessee is reasonably certain to exercise it, which changes the accounting term.' }),
    status: t.field({ type: OptionStatusEnum, description: 'An open option lapses once its notice deadline passes unexercised.', resolve: (o, _a, ctx) => optionStatus(o.status, o.exercise_on, o.notice_by, ctx.today) }),
    terms: t.exposeString('terms', { nullable: true }),
  }),
});

export const Deposit = builder.objectRef<Selectable<DepositTable>>('Deposit').implement({
  fields: (t) => ({
    kind: t.field({ type: DepositKindEnum, resolve: (d) => d.kind }),
    amount: t.field({ type: Money, resolve: (d) => money(d.amount, d.currency) }),
    heldBy: t.exposeString('held_by'),
    returnDueOn: t.field({ type: 'Date', nullable: true, resolve: (d) => d.return_due_on }),
    status: t.field({ type: DepositStatusEnum, resolve: (d) => d.status }),
  }),
});

interface RentPeriodShape extends RentPeriod {
  currency: string;
  isCurrent: boolean;
}

export const RentPeriodType = builder.objectRef<RentPeriodShape>('RentPeriod').implement({
  fields: (t) => ({
    index: t.exposeInt('index'),
    start: t.field({ type: 'Date', resolve: (p) => p.start }),
    end: t.field({ type: 'Date', resolve: (p) => p.end }),
    dueOn: t.field({ type: 'Date', resolve: (p) => p.dueOn }),
    rent: t.field({ type: Money, resolve: (p) => money(p.rent.toFixed(), p.currency) }),
    change: t.string({ nullable: true, description: 'FIXED_UPLIFT or STEP when the rent changed in this period.', resolve: (p) => p.change }),
    isCurrent: t.exposeBoolean('isCurrent'),
  }),
});

export async function rentTermsFor(ctx: Context, lease: LeaseRow): Promise<RentTerms> {
  const [escalations, steps] = await Promise.all([ctx.loaders.escalations.load(lease.id), ctx.loaders.rentSteps.load(lease.id)]);
  return {
    commencementDate: lease.commencement_date,
    expiryDate: lease.expiry_date,
    frequency: lease.payment_frequency,
    timing: lease.payment_timing,
    rentPerPeriod: lease.rent_per_period,
    escalations: escalations.map((e) => ({ kind: e.kind, rate: e.rate, everyMonths: e.every_months, firstReviewOn: e.first_review_on, cap: e.cap, collar: e.collar })),
    steps: steps.map((s) => ({ startsOn: s.starts_on, rentPerPeriod: s.rent_per_period })),
  };
}

export const Lease = builder.node(builder.objectRef<LeaseRow>('Lease'), {
  description: 'One lease of one set of premises. Its id is stable across private edits in a session.',
  id: { resolve: (l) => l.lease_id },
  loadMany: (ids, ctx) => ctx.loaders.lease.loadMany(ids).then((rows) => rows.map((r) => (r instanceof Error ? null : r))),
  fields: (t) => ({
    reference: t.exposeString('reference'),
    status: t.field({ type: LeaseStatusEnum, resolve: (l) => l.status }),
    version: t.exposeInt('version', { description: 'Increments on every change; send it back with amendments.' }),
    property: t.field({ type: Property, resolve: async (l, _a, ctx) => (await ctx.loaders.property.load(l.property_id))! }),
    premises: t.exposeString('premises'),
    areaSqm: t.field({ type: 'Decimal', resolve: (l) => l.area_sqm }),
    countryCode: t.field({ type: 'CountryCode', resolve: (l) => l.country_code }),
    city: t.exposeString('city'),
    propertyType: t.field({ type: PropertyTypeEnum, resolve: (l) => l.property_type }),
    propertyName: t.exposeString('property_name'),
    landlordName: t.exposeString('landlord_name'),
    lesseeEntity: t.exposeString('lessee_entity'),
    commencementDate: t.field({ type: 'Date', resolve: (l) => l.commencement_date }),
    expiryDate: t.field({ type: 'Date', resolve: (l) => l.expiry_date }),
    termMonths: t.int({ resolve: (l) => monthsBetween(l.commencement_date, l.expiry_date) + 1 }),
    daysToExpiry: t.int({ description: 'Negative once the lease has expired.', resolve: (l, _a, ctx) => daysBetween(ctx.today, l.expiry_date) }),
    currency: t.field({ type: 'CurrencyCode', resolve: (l) => l.currency }),
    paymentFrequency: t.field({ type: PaymentFrequencyEnum, resolve: (l) => l.payment_frequency }),
    paymentTiming: t.field({ type: PaymentTimingEnum, resolve: (l) => l.payment_timing }),
    rentPerPeriod: t.field({ type: Money, description: 'Rent per payment period at commencement.', resolve: (l) => money(l.rent_per_period, l.currency) }),
    serviceChargePerPeriod: t.field({ type: Money, resolve: (l) => money(l.service_charge_per_period, l.currency) }),
    annualRent: t.field({ type: Money, description: 'Passing rent today, annualised.', resolve: (l) => money(l.annual_rent, l.currency) }),
    annualRentReporting: t.field({
      type: Money, description: 'Passing rent today in the company’s reporting currency, at the company’s exchange rates.',
      resolve: async (l, _a, ctx) => money(l.annual_rent_reporting, (await ctx.loaders.tenant.load(l.tenant_id))!.reporting_currency),
    }),
    discountRate: t.field({ type: 'Decimal', description: 'Incremental borrowing rate, effective annual, as a fraction.', resolve: (l) => l.discount_rate }),
    initialDirectCosts: t.field({ type: Money, resolve: (l) => money(l.initial_direct_costs, l.currency) }),
    incentives: t.field({ type: Money, resolve: (l) => money(l.incentives, l.currency) }),
    prepayments: t.field({ type: Money, resolve: (l) => money(l.prepayments, l.currency) }),
    restorationCost: t.field({ type: Money, resolve: (l) => money(l.restoration_cost, l.currency) }),
    usefulLifeMonths: t.exposeInt('useful_life_months', { nullable: true }),
    ownershipTransfers: t.exposeBoolean('ownership_transfers'),
    standard: t.field({ type: AccountingStandardEnum, resolve: (l) => l.standard }),
    asc842Class: t.field({ type: Asc842ClassEnum, nullable: true, resolve: (l) => l.asc842_class }),
    exemption: t.field({ type: LeaseExemptionEnum, resolve: (l) => l.exemption }),
    costCentre: t.exposeString('cost_centre', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    nextKeyDate: t.field({ type: 'Date', nullable: true, resolve: (l) => l.next_key_date }),
    nextKeyKind: t.field({ type: KeyDateKindEnum, nullable: true, resolve: (l) => l.next_key_kind }),
    changedInSandbox: t.boolean({ description: 'True when the signed-in person changed this lease in their private workspace.', resolve: (l) => l.sandbox_id !== null }),
    parties: t.field({ type: [LeaseParty], resolve: (l, _a, ctx) => ctx.loaders.parties.load(l.id) }),
    escalations: t.field({ type: [Escalation], resolve: (l, _a, ctx) => ctx.loaders.escalations.load(l.id) }),
    rentSteps: t.field({ type: [RentStep], resolve: (l, _a, ctx) => ctx.loaders.rentSteps.load(l.id) }),
    options: t.field({ type: [LeaseOption], resolve: (l, _a, ctx) => ctx.loaders.options.load(l.id) }),
    deposits: t.field({ type: [Deposit], resolve: (l, _a, ctx) => ctx.loaders.deposits.load(l.id) }),
    rentSchedule: t.connection({
      type: RentPeriodType,
      complexity: (args) => ({ field: 2, multiplier: args.first ?? 20 }),
      resolve: async (l, args, ctx) => {
        const periods = rentSchedule(await rentTermsFor(ctx, l), MINOR_UNITS[l.currency] ?? 2).map((p) => ({
          ...p, currency: l.currency, isCurrent: p.start <= ctx.today && ctx.today <= p.end,
        }));
        return { ...resolveArrayConnection({ args, defaultSize: 40, maxSize: 200 }, periods), totalCount: periods.length };
      },
    }),
    createdAt: t.field({ type: 'DateTime', resolve: (l) => l.created_at }),
    updatedAt: t.field({ type: 'DateTime', resolve: (l) => l.updated_at }),
    updatedBy: t.field({ type: User, nullable: true, resolve: (l, _a, ctx) => (l.updated_by ? ctx.loaders.user.load(l.updated_by) : null) }),
  }),
});
