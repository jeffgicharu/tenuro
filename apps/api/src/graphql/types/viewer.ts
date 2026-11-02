import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../../db/types.ts';
import type { SessionInfo } from '../../auth/session.ts';
import { config } from '../../config.ts';
import { builder } from '../builder.ts';
import type { Context } from '../context.ts';
import { applyLeaseFilter, applyLeaseOrder, type LeaseFilterInput } from '../register-query.ts';
import {
  DateRange, DecimalRange, KeyDateKindEnum, LeaseStatusEnum, PropertyTypeEnum, SortDirectionEnum, ViewScopeEnum,
} from './common.ts';
import { Lease, Property } from './lease.ts';
import type { LeaseRow } from './lease-shape.ts';
import { Tenant, User } from './tenant.ts';

export const LeaseOrderFieldEnum = builder.enumType('LeaseOrderField', {
  values: ['REFERENCE', 'PROPERTY_NAME', 'CITY', 'COUNTRY', 'LANDLORD', 'STATUS', 'COMMENCEMENT_DATE', 'EXPIRY_DATE',
    'ANNUAL_RENT', 'AREA', 'NEXT_KEY_DATE', 'UPDATED_AT'] as const,
});

export const LeaseOrder = builder.inputType('LeaseOrder', {
  fields: (t) => ({
    field: t.field({ type: LeaseOrderFieldEnum, required: true }),
    direction: t.field({ type: SortDirectionEnum, required: true }),
  }),
});

export const LeaseFilter = builder.inputType('LeaseFilter', {
  description: 'All set fields must match. List fields match any of their values.',
  fields: (t) => ({
    search: t.string({ required: false, description: 'Matches reference, property, landlord, city, premises or cost centre.' }),
    status: t.field({ type: [LeaseStatusEnum], required: false }),
    countryCode: t.field({ type: ['CountryCode'], required: false }),
    city: t.stringList({ required: false }),
    propertyType: t.field({ type: [PropertyTypeEnum], required: false }),
    currency: t.field({ type: ['CurrencyCode'], required: false }),
    expiry: t.field({ type: DateRange, required: false }),
    expiresWithinDays: t.int({ required: false }),
    annualRent: t.field({ type: DecimalRange, required: false, description: 'Passing rent in the reporting currency.' }),
    nextKeyWithinDays: t.int({ required: false }),
    nextKeyKind: t.field({ type: [KeyDateKindEnum], required: false }),
    hasOpenBreak: t.boolean({ required: false }),
    changedInSandbox: t.boolean({ required: false }),
  }),
});

interface FacetCount {
  value: string;
  count: number;
}

const Facet = builder.objectRef<FacetCount>('FacetCount').implement({
  fields: (t) => ({ value: t.exposeString('value'), count: t.exposeInt('count') }),
});

interface FacetsShape {
  filter: LeaseFilterInput | null;
}

const LeaseFacets = builder.objectRef<FacetsShape>('LeaseFacets').implement({
  description: 'Counts for each filter value, within the other active filters.',
  fields: (t) => {
    const facet = (column: 'status' | 'country_code' | 'property_type' | 'currency' | 'city', key: keyof LeaseFilterInput) =>
      t.field({
        type: [Facet],
        resolve: async (f, _a, ctx) => {
          // Exclude the facet's own filter so every option stays visible with its count.
          const rest = { ...(f.filter ?? {}), [key]: null } as LeaseFilterInput;
          const rows = await applyLeaseFilter(ctx.tx.selectFrom('v_lease'), rest, ctx.today)
            .select([sql.ref<string>(column).as('value'), sql<number>`count(*)::int`.as('count')])
            .groupBy(column).orderBy('count', 'desc').limit(60).execute();
          return rows as FacetCount[];
        },
      });
    return {
      status: facet('status', 'status'),
      countryCode: facet('country_code', 'countryCode'),
      propertyType: facet('property_type', 'propertyType'),
      currency: facet('currency', 'currency'),
      city: facet('city', 'city'),
    };
  },
});

type SavedViewRow = Selectable<Database['v_saved_view']>;

export const SavedView = builder.node(builder.objectRef<SavedViewRow>('SavedView'), {
  id: { resolve: (v) => v.view_id },
  loadMany: async (ids, ctx) => {
    const rows = await ctx.tx.selectFrom('v_saved_view').selectAll().where('view_id', 'in', ids as string[]).execute();
    const map = new Map(rows.map((r) => [r.view_id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    name: t.exposeString('name'),
    scope: t.field({ type: ViewScopeEnum, resolve: (v) => v.scope }),
    shared: t.boolean({ description: 'Shared views belong to the company; others to one person.', resolve: (v) => v.owner_id === null }),
    config: t.string({ description: 'The view as JSON: filters, sort and visible columns.', resolve: (v) => JSON.stringify(v.config) }),
    position: t.exposeInt('position'),
  }),
});

interface SandboxShape {
  id: string;
  writesUsed: number;
}

const Sandbox = builder.objectRef<SandboxShape>('Sandbox').implement({
  description: 'The visitor’s private copy of the data.',
  fields: (t) => ({
    writesUsed: t.exposeInt('writesUsed'),
    writesLimit: t.int({ resolve: () => config.limits.sandboxWrites }),
    nextResetAt: t.field({ type: 'DateTime', description: 'When the nightly rebuild clears every private copy (03:00 Nairobi time).', resolve: () => nextReset() }),
  }),
});

function nextReset(now = new Date()): Date {
  // 03:00 in Africa/Nairobi is 00:00 UTC (no daylight saving there).
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export const Viewer = builder.objectRef<SessionInfo>('Viewer').implement({
  description: 'The signed-in person and everything scoped to them.',
  fields: (t) => ({
    user: t.field({ type: User, resolve: async (s, _a, ctx) => (await ctx.loaders.user.load(s.userId))! }),
    tenant: t.field({ type: Tenant, resolve: async (s, _a, ctx) => (await ctx.loaders.tenant.load(s.tenantId))! }),
    canEdit: t.boolean({ resolve: (s) => s.role !== 'VIEWER' }),
    isAdmin: t.boolean({ resolve: (s) => s.role === 'ADMIN' }),
    sandbox: t.field({
      type: Sandbox, nullable: true,
      resolve: async (s, _a, ctx) => {
        if (!s.sandboxId) return null;
        const row = await ctx.tx.selectFrom('sandbox').select(['id', 'write_count']).where('id', '=', s.sandboxId).executeTakeFirst();
        return row ? { id: row.id, writesUsed: row.write_count } : null;
      },
    }),
    leases: t.connection({
      type: Lease,
      args: {
        filter: t.arg({ type: LeaseFilter, required: false }),
        orderBy: t.arg({ type: [LeaseOrder], required: false }),
      },
      complexity: (args) => ({ field: 5, multiplier: Math.min(args.first ?? 50, 200) }),
      resolve: async (_s, args, ctx) => {
        const filter = args.filter as LeaseFilterInput | null;
        const base = applyLeaseFilter(ctx.tx.selectFrom('v_lease'), filter, ctx.today);
        const [{ n }] = (await base.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
        const page = await resolveOffsetConnection({ args, defaultSize: 50, maxSize: 200, totalCount: n }, ({ limit, offset }) =>
          applyLeaseOrder(base.selectAll(), args.orderBy).limit(limit).offset(offset).execute() as Promise<LeaseRow[]>);
        return { ...page, totalCount: n };
      },
    }),
    leaseFacets: t.field({
      type: LeaseFacets,
      args: { filter: t.arg({ type: LeaseFilter, required: false }) },
      resolve: (_s, args) => ({ filter: (args.filter as LeaseFilterInput | null) ?? null }),
    }),
    properties: t.connection({
      type: Property,
      args: { search: t.arg.string({ required: false }) },
      resolve: async (_s, args, ctx) => {
        let q = ctx.tx.selectFrom('property');
        const s = args.search?.trim();
        const term = s ? `%${s.slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
        if (term) {
          q = q.where((eb) => eb.or([eb('name', 'ilike', term), eb('city', 'ilike', term), eb('code', 'ilike', term), eb('address_line', 'ilike', term)]));
        }
        const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
        // Buildings whose name matches come first, then code and city matches, then those matching
        // only on their street address; otherwise address matches crowd out what was typed.
        // (Only with a term: a bare constant in ORDER BY would be read as a column position.)
        const page = await resolveOffsetConnection({ args, defaultSize: 20, maxSize: 50, totalCount: n }, ({ limit, offset }) => {
          let ordered = q.selectAll();
          if (term) {
            ordered = ordered.orderBy(sql`CASE WHEN name ILIKE ${term} THEN 0 WHEN code ILIKE ${term} THEN 1 WHEN city ILIKE ${term} THEN 2 ELSE 3 END`);
          }
          return ordered.orderBy('name').orderBy('id').limit(limit).offset(offset).execute();
        });
        return { ...page, totalCount: n };
      },
    }),
    savedViews: t.connection({
      type: SavedView,
      args: { scope: t.arg({ type: ViewScopeEnum, required: true }) },
      resolve: async (s, args, ctx) => {
        const rows = await ctx.tx.selectFrom('v_saved_view').selectAll().where('scope', '=', args.scope)
          .where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', s.userId)]))
          .orderBy('position').orderBy('created_at').execute();
        const page = await resolveOffsetConnection({ args, defaultSize: 50, maxSize: 100, totalCount: rows.length }, ({ limit, offset }) =>
          rows.slice(offset, offset + limit));
        return { ...page, totalCount: rows.length };
      },
    }),
  }),
});

builder.queryFields((t) => ({
  viewer: t.field({
    type: Viewer, nullable: true,
    description: 'Null when nobody is signed in.',
    resolve: (_r, _a, ctx: Context) => ctx.session,
  }),
  signInAccounts: t.field({
    type: [User],
    description: 'The one-click sign-ins: one per role in each company.',
    resolve: async (_r, _a, ctx) => {
      return ctx.tx.selectFrom('app_user').innerJoin('tenant', 'tenant.id', 'app_user.tenant_id')
        .selectAll('app_user').where('app_user.is_listed', '=', true)
        .orderBy('tenant.sort_order').orderBy(sql`array_position(array['ADMIN','MANAGER','VIEWER']::user_role[], app_user.role)`).execute();
    },
  }),
}));
