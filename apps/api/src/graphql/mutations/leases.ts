import { randomUUID } from 'node:crypto';
import { decodeGlobalID, encodeGlobalID } from '@pothos/plugin-relay';
import { sql } from 'kysely';
import { validateLease, type LeaseFormData } from '@tenuro/lease-rules';
import {
  deleteChildren, diffForms, insertChildren, leaseColumns, leaseToForm, loadChildren, replaceKeyDates, statusFor,
} from '../../domain/lease-write.ts';
import { builder } from '../builder.ts';
import { chargeWrite, requireRole, type Context } from '../context.ts';
import { NotFound, StaleVersion, ValidationFailed, WRITE_ERRORS } from '../errors.ts';
import {
  AccountingStandardEnum, Asc842ClassEnum, DepositKindEnum, EscalationKindEnum, LeaseExemptionEnum, OptionKindEnum,
  PaymentFrequencyEnum, PaymentTimingEnum,
} from '../types/common.ts';
import { Lease } from '../types/lease.ts';
import type { LeaseRow } from '../types/lease-shape.ts';
import { Viewer } from '../types/viewer.ts';

const PartyInput = builder.inputType('PartyInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    contactName: t.string({ required: false }),
    email: t.string({ required: false }),
    phone: t.string({ required: false }),
  }),
});

const EscalationInput = builder.inputType('EscalationInput', {
  fields: (t) => ({
    kind: t.field({ type: EscalationKindEnum, required: true }),
    ratePercent: t.field({ type: 'Decimal', required: false, description: 'Fixed uplift in percent, e.g. "5" for 5%.' }),
    everyMonths: t.int({ required: true }),
    firstReviewOn: t.field({ type: 'Date', required: true }),
    indexName: t.string({ required: false }),
    capPercent: t.field({ type: 'Decimal', required: false }),
    collarPercent: t.field({ type: 'Decimal', required: false }),
  }),
});

const RentStepInput = builder.inputType('RentStepInput', {
  fields: (t) => ({
    startsOn: t.field({ type: 'Date', required: true }),
    rentPerPeriod: t.field({ type: 'Decimal', required: true }),
  }),
});

const OptionInput = builder.inputType('LeaseOptionInput', {
  fields: (t) => ({
    kind: t.field({ type: OptionKindEnum, required: true }),
    exerciseOn: t.field({ type: 'Date', required: true }),
    noticeBy: t.field({ type: 'Date', required: false }),
    termMonths: t.int({ required: false }),
    price: t.field({ type: 'Decimal', required: false }),
    reasonablyCertain: t.boolean({ required: true }),
    terms: t.string({ required: false }),
  }),
});

const DepositInput = builder.inputType('DepositInput', {
  fields: (t) => ({
    kind: t.field({ type: DepositKindEnum, required: true }),
    amount: t.field({ type: 'Decimal', required: true }),
    heldBy: t.string({ required: true }),
    returnDueOn: t.field({ type: 'Date', required: false }),
  }),
});

const AccountingInput = builder.inputType('AccountingInput', {
  fields: (t) => ({
    discountRatePercent: t.field({ type: 'Decimal', required: true, description: 'Incremental borrowing rate in percent.' }),
    initialDirectCosts: t.field({ type: 'Decimal', required: false }),
    incentives: t.field({ type: 'Decimal', required: false }),
    prepayments: t.field({ type: 'Decimal', required: false }),
    restorationCost: t.field({ type: 'Decimal', required: false }),
    usefulLifeMonths: t.int({ required: false }),
    ownershipTransfers: t.boolean({ required: true }),
    standard: t.field({ type: AccountingStandardEnum, required: true }),
    asc842Class: t.field({ type: Asc842ClassEnum, required: false }),
    exemption: t.field({ type: LeaseExemptionEnum, required: true }),
  }),
});

export const LeaseInput = builder.inputType('LeaseInput', {
  description: 'A complete lease, as entered on the new-lease and amend-lease form.',
  fields: (t) => ({
    landlord: t.field({ type: PartyInput, required: true }),
    lesseeEntity: t.string({ required: true }),
    guarantor: t.field({ type: PartyInput, required: false }),
    agent: t.field({ type: PartyInput, required: false }),
    propertyId: t.id({ required: true }),
    premises: t.string({ required: true }),
    areaSqm: t.field({ type: 'Decimal', required: true }),
    commencementDate: t.field({ type: 'Date', required: true }),
    expiryDate: t.field({ type: 'Date', required: true }),
    currency: t.field({ type: 'CurrencyCode', required: true }),
    paymentFrequency: t.field({ type: PaymentFrequencyEnum, required: true }),
    paymentTiming: t.field({ type: PaymentTimingEnum, required: true }),
    rentPerPeriod: t.field({ type: 'Decimal', required: true }),
    serviceChargePerPeriod: t.field({ type: 'Decimal', required: false }),
    escalation: t.field({ type: EscalationInput, required: false }),
    rentSteps: t.field({ type: [RentStepInput], required: true }),
    options: t.field({ type: [OptionInput], required: true }),
    deposits: t.field({ type: [DepositInput], required: true }),
    accounting: t.field({ type: AccountingInput, required: true }),
    costCentre: t.string({ required: false }),
    notes: t.string({ required: false }),
  }),
});

type LeaseInputShape = typeof LeaseInput.$inferInput;
type PartyShape = typeof PartyInput.$inferInput;

const s = (v: string | null | undefined) => v ?? '';
const party = (p: PartyShape) => ({ name: p.name, contactName: s(p.contactName), email: s(p.email), phone: s(p.phone) });

export function inputToForm(i: LeaseInputShape): LeaseFormData {
  const e = i.escalation;
  return {
    parties: { landlord: party(i.landlord), lesseeEntity: i.lesseeEntity, guarantor: i.guarantor ? party(i.guarantor) : null, agent: i.agent ? party(i.agent) : null },
    property: { propertyId: String(i.propertyId), premises: i.premises, areaSqm: i.areaSqm },
    term: { commencementDate: i.commencementDate, expiryDate: i.expiryDate },
    rent: {
      currency: i.currency, paymentFrequency: i.paymentFrequency, paymentTiming: i.paymentTiming,
      rentPerPeriod: i.rentPerPeriod, serviceChargePerPeriod: s(i.serviceChargePerPeriod),
      escalation: e
        ? { kind: e.kind, ratePercent: s(e.ratePercent), everyMonths: String(e.everyMonths), firstReviewOn: e.firstReviewOn,
            indexName: s(e.indexName), capPercent: s(e.capPercent), collarPercent: s(e.collarPercent) }
        : { kind: 'NONE', ratePercent: '', everyMonths: '12', firstReviewOn: '', indexName: '', capPercent: '', collarPercent: '' },
      steps: i.rentSteps.map((r) => ({ startsOn: r.startsOn, rentPerPeriod: r.rentPerPeriod })),
    },
    options: i.options.map((o) => ({
      kind: o.kind, exerciseOn: o.exerciseOn, noticeBy: s(o.noticeBy), termMonths: o.termMonths?.toString() ?? '',
      price: s(o.price), reasonablyCertain: o.reasonablyCertain, terms: s(o.terms),
    })),
    deposits: i.deposits.map((d) => ({ kind: d.kind, amount: d.amount, heldBy: d.heldBy, returnDueOn: s(d.returnDueOn) })),
    accounting: {
      discountRatePercent: i.accounting.discountRatePercent, initialDirectCosts: s(i.accounting.initialDirectCosts),
      incentives: s(i.accounting.incentives), prepayments: s(i.accounting.prepayments), restorationCost: s(i.accounting.restorationCost),
      usefulLifeMonths: i.accounting.usefulLifeMonths?.toString() ?? '', ownershipTransfers: i.accounting.ownershipTransfers,
      standard: i.accounting.standard, asc842Class: i.accounting.asc842Class ?? '', exemption: i.accounting.exemption, costCentre: s(i.costCentre),
    },
    notes: s(i.notes),
  };
}

const toFieldErrors = (issues: ReturnType<typeof validateLease>) =>
  new ValidationFailed(issues.map((i) => ({ path: i.path, code: i.code, message: i.message, step: i.step })));

export async function resolvePropertyId(ctx: Context, globalId: string) {
  let localId: string;
  try {
    const decoded = decodeGlobalID(globalId);
    if (decoded.typename !== 'Property') throw new Error('wrong type');
    localId = decoded.id;
  } catch {
    throw new ValidationFailed([{ path: 'property.propertyId', code: 'unknown_property', message: 'Choose a property from the portfolio.', step: 'property' }]);
  }
  const property = await ctx.tx.selectFrom('property').selectAll().where('id', '=', localId).executeTakeFirst();
  if (!property) throw new ValidationFailed([{ path: 'property.propertyId', code: 'unknown_property', message: 'Choose a property from the portfolio.', step: 'property' }]);
  return property;
}

async function nextReference(ctx: Context, country: string, type: string): Promise<string> {
  const row = await ctx.tx.selectFrom('v_lease').select(sql<number>`coalesce(max(nullif(regexp_replace(reference, '^.*-', ''), '')::int), 0)`.as('n'))
    .where('reference', 'like', '%-%-%').executeTakeFirstOrThrow();
  return `${country}-${type.slice(0, 1)}-${String(row.n + 1).padStart(5, '0')}`;
}

async function deleteDraft(ctx: Context, draftId: string | null | undefined) {
  if (!draftId) return;
  const { id } = decodeGlobalID(String(draftId));
  await ctx.tx.deleteFrom('lease_draft').where('id', '=', id).where('owner_id', '=', ctx.session!.userId).execute();
}

async function reportingCurrency(ctx: Context, tenantId: string) {
  return (await ctx.loaders.tenant.load(tenantId))!.reporting_currency;
}

builder.relayMutationField(
  'submitLease',
  {
    inputFields: (t) => ({
      lease: t.field({ type: LeaseInput, required: true }),
      draftId: t.id({ required: false, description: 'The draft this lease came from; it is removed on success.' }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const form = inputToForm(input.lease);
      const issues = validateLease(form);
      if (issues.length) throw toFieldErrors(issues);
      const property = await resolvePropertyId(ctx, String(input.lease.propertyId));
      await chargeWrite(ctx, 12);

      const rowId = randomUUID();
      const target = {
        rowId, tenantId: session.tenantId, sandboxId: session.sandboxId, property, userId: session.userId, today: ctx.today,
        reportingCurrency: await reportingCurrency(ctx, session.tenantId),
      };
      await ctx.tx.insertInto('lease').values({
        id: rowId, tenant_id: session.tenantId, sandbox_id: session.sandboxId, origin_id: null, deleted_at: null,
        reference: await nextReference(ctx, property.country_code, property.type),
        status: statusFor(ctx.today, form.term.expiryDate),
        created_by: session.userId,
        ...leaseColumns(form, target),
      }).execute();
      await insertChildren(ctx, form, target);
      const { next } = await replaceKeyDates(ctx, rowId, form, session.userId, session.tenantId);
      await ctx.tx.updateTable('lease').set({ next_key_date: next?.due ?? null, next_key_kind: next?.kind ?? null }).where('id', '=', rowId).execute();
      await ctx.tx.insertInto('activity').values({
        id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: rowId, actor_id: session.userId,
        verb: 'LEASE_CREATED', summary: 'Lease created', diff: null,
      }).execute();
      await deleteDraft(ctx, input.draftId);
      ctx.loaders.lease.clear(rowId);
      return { lease: (await ctx.loaders.lease.load(rowId))! };
    },
  },
  {
    outputFields: (t) => ({
      lease: t.field({ type: Lease, resolve: (p) => p.lease }),
      viewer: t.field({ type: Viewer, resolve: (_p, _a, ctx) => ctx.session! }),
    }),
  },
);

builder.relayMutationField(
  'amendLease',
  {
    inputFields: (t) => ({
      id: t.globalID({ required: true, for: Lease }),
      version: t.int({ required: true, description: 'The version the person started from.' }),
      lease: t.field({ type: LeaseInput, required: true }),
      draftId: t.id({ required: false }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const current = await ctx.loaders.lease.load(input.id.id);
      if (!current) throw new NotFound('The lease');
      if (current.version !== input.version) throw new StaleVersion(current.version);
      const form = inputToForm(input.lease);
      const issues = validateLease(form);
      if (issues.length) throw toFieldErrors(issues);
      const property = await resolvePropertyId(ctx, String(input.lease.propertyId));
      const before = leaseToForm(current, await loadChildren(ctx, current.id), encodeGlobalID('Property', current.property_id));
      const diff = diffForms(before, form);
      if (diff.length === 0) return { lease: current };
      await chargeWrite(ctx, 12);

      const leaseId = current.lease_id;
      const copyOnWrite = session.sandboxId !== null && current.sandbox_id === null;
      const rowId = copyOnWrite ? randomUUID() : current.id;
      const target = {
        rowId, tenantId: session.tenantId, sandboxId: session.sandboxId, property, userId: session.userId, today: ctx.today,
        reportingCurrency: await reportingCurrency(ctx, session.tenantId),
      };
      const columns = { ...leaseColumns(form, target), status: statusFor(ctx.today, form.term.expiryDate, current.status) };
      if (copyOnWrite) {
        const { lease_id: _logical, ...base } = current;
        await ctx.tx.insertInto('lease').values({
          ...base, ...columns, id: rowId, sandbox_id: session.sandboxId, origin_id: leaseId, version: current.version + 1,
        } as never).execute();
      } else {
        const updated = await ctx.tx.updateTable('lease').set({ ...columns, version: sql`version + 1` })
          .where('id', '=', rowId).where('version', '=', input.version).executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) throw new StaleVersion(current.version + 1);
        await deleteChildren(ctx, rowId);
      }
      await insertChildren(ctx, form, target);
      const { next } = await replaceKeyDates(ctx, leaseId, form, session.userId, session.tenantId);
      await ctx.tx.updateTable('lease').set({ next_key_date: next?.due ?? null, next_key_kind: next?.kind ?? null }).where('id', '=', rowId).execute();
      await ctx.tx.insertInto('activity').values({
        id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: leaseId, actor_id: session.userId,
        verb: 'LEASE_AMENDED', summary: `Lease amended (${diff.length} ${diff.length === 1 ? 'change' : 'changes'})`, diff: JSON.stringify(diff),
      }).execute();
      await deleteDraft(ctx, input.draftId);
      ctx.loaders.lease.clear(leaseId);
      return { lease: (await ctx.loaders.lease.load(leaseId))! };
    },
  },
  {
    outputFields: (t) => ({
      lease: t.field({ type: Lease, resolve: (p: { lease: LeaseRow }) => p.lease }),
    }),
  },
);

builder.objectFields(Lease, (t) => ({
  formData: t.string({
    description: 'The lease as form data (JSON), the starting point for an amendment.',
    resolve: async (l, _a, ctx) => JSON.stringify(leaseToForm(l, await loadChildren(ctx, l.id), encodeGlobalID('Property', l.property_id))),
  }),
}));
