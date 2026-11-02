import { randomUUID } from 'node:crypto';
import { encodeGlobalID, resolveOffsetConnection } from '@pothos/plugin-relay';
import { sql, type Selectable } from 'kysely';
import { emptyLeaseForm, LEASE_FORM_STEPS, validateLease, type LeaseFormData } from '@tenuro/lease-rules';
import type { LeaseDraftTable } from '../../db/types.ts';
import { builder } from '../builder.ts';
import { chargeWrite, requireRole } from '../context.ts';
import { NotFound, StaleVersion, ValidationFailed, WRITE_ERRORS } from '../errors.ts';
import { Lease } from '../types/lease.ts';
import { Viewer } from '../types/viewer.ts';

type DraftRow = Selectable<LeaseDraftTable>;

const MAX_DRAFT_BYTES = 64 * 1024;

const StepState = builder.objectRef<{ step: string; issues: number }>('LeaseFormStepState').implement({
  fields: (t) => ({ step: t.exposeString('step'), issueCount: t.exposeInt('issues') }),
});

export const LeaseDraft = builder.node(builder.objectRef<DraftRow>('LeaseDraft'), {
  description: 'An unfinished new lease or amendment, saved as the person works through the form.',
  id: { resolve: (d) => d.id },
  loadMany: async (ids, ctx) => {
    if (!ctx.session) return ids.map(() => null);
    const rows = await ctx.tx.selectFrom('lease_draft').selectAll().where('id', 'in', ids as string[]).where('owner_id', '=', ctx.session.userId).execute();
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    data: t.string({ description: 'The form data as JSON.', resolve: (d) => JSON.stringify(d.data) }),
    currentStep: t.exposeString('current_step'),
    version: t.exposeInt('version'),
    lease: t.field({ type: Lease, nullable: true, description: 'Set when the draft amends an existing lease.', resolve: (d, _a, ctx) => (d.lease_id ? ctx.loaders.lease.load(d.lease_id) : null) }),
    steps: t.field({
      type: [StepState],
      description: 'Outstanding issues per step, so the stepper can show where work remains.',
      resolve: (d) => {
        const issues = validateLease(d.data as unknown as LeaseFormData);
        return LEASE_FORM_STEPS.map((step) => ({ step, issues: issues.filter((i) => i.step === step).length }));
      },
    }),
    updatedAt: t.field({ type: 'DateTime', resolve: (d) => d.updated_at }),
  }),
});

function parseDraft(json: string): LeaseFormData {
  if (json.length > MAX_DRAFT_BYTES) throw new ValidationFailed([{ path: 'data', code: 'too_long', message: 'This draft is too large to save.', step: null }]);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ValidationFailed([{ path: 'data', code: 'invalid', message: 'The draft could not be read.', step: null }]);
  }
  // Merge onto an empty form so a draft from an older client still has every field.
  const base = emptyLeaseForm({ currency: 'USD', lesseeEntity: '' });
  if (!value || typeof value !== 'object') throw new ValidationFailed([{ path: 'data', code: 'invalid', message: 'The draft could not be read.', step: null }]);
  const v = value as Partial<LeaseFormData>;
  return {
    ...base, ...v,
    parties: { ...base.parties, ...v.parties },
    property: { ...base.property, ...v.property },
    term: { ...base.term, ...v.term },
    rent: { ...base.rent, ...v.rent, escalation: { ...base.rent.escalation, ...v.rent?.escalation } },
    accounting: { ...base.accounting, ...v.accounting },
    options: Array.isArray(v.options) ? v.options.slice(0, 10) : [],
    deposits: Array.isArray(v.deposits) ? v.deposits.slice(0, 5) : [],
  };
}

const StepEnum = builder.enumType('LeaseFormStep', { values: LEASE_FORM_STEPS });

builder.relayMutationField(
  'saveLeaseDraft',
  {
    inputFields: (t) => ({
      id: t.globalID({ required: false, for: LeaseDraft }),
      leaseId: t.globalID({ required: false, for: Lease, description: 'The lease being amended, for a new amendment draft.' }),
      currentStep: t.field({ type: StepEnum, required: true }),
      data: t.string({ required: true }),
      version: t.int({ required: false }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const data = parseDraft(input.data);
      if (input.id) {
        const existing = await ctx.tx.selectFrom('lease_draft').selectAll().where('id', '=', input.id.id).where('owner_id', '=', session.userId).executeTakeFirst();
        if (!existing) throw new NotFound('The draft');
        if (input.version != null && existing.version !== input.version) throw new StaleVersion(existing.version);
        const draft = await ctx.tx.updateTable('lease_draft')
          .set({ data: JSON.stringify(data), current_step: input.currentStep, version: sql`version + 1`, updated_at: sql<Date>`now()` as unknown as Date })
          .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
        return { draft };
      }
      await chargeWrite(ctx);
      const count = await ctx.tx.selectFrom('lease_draft').select(sql<number>`count(*)::int`.as('n')).where('owner_id', '=', session.userId).executeTakeFirstOrThrow();
      if (count.n >= 20) {
        throw new ValidationFailed([{ path: 'data', code: 'too_many', message: 'You have 20 unfinished drafts. Finish or discard one first.', step: null }]);
      }
      const draft = await ctx.tx.insertInto('lease_draft').values({
        id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, owner_id: session.userId,
        lease_id: input.leaseId?.id ?? null, data: JSON.stringify(data), current_step: input.currentStep,
      }).returningAll().executeTakeFirstOrThrow();
      return { draft };
    },
  },
  { outputFields: (t) => ({ draft: t.field({ type: LeaseDraft, resolve: (p) => p.draft }) }) },
);

builder.relayMutationField(
  'discardLeaseDraft',
  { inputFields: (t) => ({ id: t.globalID({ required: true, for: LeaseDraft }) }) },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const res = await ctx.tx.deleteFrom('lease_draft').where('id', '=', input.id.id).where('owner_id', '=', session.userId).executeTakeFirst();
      if (Number(res.numDeletedRows) === 0) throw new NotFound('The draft');
      return { deletedId: input.id.id };
    },
  },
  { outputFields: (t) => ({ deletedDraftId: t.id({ resolve: (p) => encodeGlobalID('LeaseDraft', p.deletedId) }) }) },
);

builder.objectFields(Viewer, (t) => ({
  leaseDrafts: t.connection({
    type: LeaseDraft,
    resolve: async (s, args, ctx) => {
      const q = ctx.tx.selectFrom('lease_draft').where('owner_id', '=', s.userId);
      const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 20, maxSize: 50, totalCount: n }, ({ limit, offset }) =>
        q.selectAll().orderBy('updated_at', 'desc').orderBy('id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
  newLeaseTemplate: t.string({
    description: 'Empty form data (JSON) with this company’s defaults filled in.',
    resolve: async (s, _a, ctx) => {
      const tenant = (await ctx.loaders.tenant.load(s.tenantId))!;
      const common = await ctx.tx.selectFrom('v_lease').select(['currency', 'lessee_entity', sql<number>`count(*)::int`.as('n')])
        .groupBy(['currency', 'lessee_entity']).orderBy('n', 'desc').limit(1).executeTakeFirst();
      return JSON.stringify(emptyLeaseForm({ currency: common?.currency ?? tenant.reporting_currency, lesseeEntity: common?.lessee_entity ?? tenant.name }));
    },
  }),
}));
