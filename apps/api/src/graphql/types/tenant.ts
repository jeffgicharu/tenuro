import type { Selectable } from 'kysely';
import type { AppUserTable, TenantTable } from '../../db/types.ts';
import { builder } from '../builder.ts';
import { UserRoleEnum } from './common.ts';

export type TenantRow = Selectable<TenantTable>;
export type UserRow = Selectable<AppUserTable>;

const DensityEnum = builder.enumType('Density', { values: ['COMPACT', 'STANDARD', 'COMFORTABLE'] as const });

export const TenantTheme = builder.objectRef<TenantRow['theme']>('TenantTheme').implement({
  description: 'Brand inputs the client turns into a full light and dark theme.',
  fields: (t) => ({
    brandHue: t.exposeFloat('brandHue', { description: 'OKLCH hue, in degrees, of the primary brand colour.' }),
    accentHue: t.exposeFloat('accentHue'),
    density: t.field({ type: DensityEnum, resolve: (th) => th.density.toUpperCase() as 'COMPACT' | 'STANDARD' | 'COMFORTABLE' }),
    logo: t.exposeString('logo'),
    logoOnDark: t.exposeString('logoOnDark'),
    mark: t.exposeString('mark'),
  }),
});

export const Tenant = builder.node(builder.objectRef<TenantRow>('Tenant'), {
  description: 'A client company whose lease portfolio this workspace holds.',
  id: { resolve: (t) => t.id },
  loadMany: (ids, ctx) => ctx.loaders.tenant.loadMany(ids).then((rows) => rows.map((r) => (r instanceof Error ? null : r))),
  fields: (t) => ({
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    nameLocal: t.exposeString('name_local', { nullable: true, description: 'The name in the company’s own script, where different.' }),
    locale: t.exposeString('locale', { description: 'BCP 47 locale for dates, numbers and currency.' }),
    languages: t.exposeStringList('languages', { description: 'Interface languages, first is the default.' }),
    reportingCurrency: t.field({ type: 'CurrencyCode', resolve: (r) => r.reporting_currency }),
    direction: t.string({ description: 'Text direction of the default language.', resolve: (r) => (r.languages[0] === 'ar' ? 'rtl' : 'ltr') }),
    theme: t.field({ type: TenantTheme, resolve: (r) => r.theme }),
    leaseCount: t.int({
      description: 'Leases in the company’s shared portfolio (excludes anyone’s private changes).',
      resolve: async (r, _a, ctx) => (await ctx.loaders.tenantSummary.load(r.id))?.lease_count ?? 0,
    }),
    countries: t.field({
      type: ['CountryCode'],
      resolve: async (r, _a, ctx) => (await ctx.loaders.tenantSummary.load(r.id))?.countries ?? [],
    }),
  }),
});

export const User = builder.node(builder.objectRef<UserRow>('User'), {
  id: { resolve: (u) => u.id },
  loadMany: (ids, ctx) => ctx.loaders.user.loadMany(ids).then((rows) => rows.map((r) => (r instanceof Error ? null : r))),
  fields: (t) => ({
    displayName: t.exposeString('display_name'),
    initials: t.string({
      resolve: (u) => u.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
    }),
    jobTitle: t.exposeString('job_title'),
    role: t.field({ type: UserRoleEnum, resolve: (u) => u.role }),
    email: t.exposeString('email'),
    locale: t.exposeString('locale', { nullable: true }),
    tenant: t.field({ type: Tenant, resolve: async (u, _a, ctx) => (await ctx.loaders.tenant.load(u.tenant_id))! }),
  }),
});
