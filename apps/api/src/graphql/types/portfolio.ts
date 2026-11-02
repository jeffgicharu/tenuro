import { sql } from 'kysely';
import { addDays } from '../../domain/dates.ts';
import { builder } from '../builder.ts';
import type { Context } from '../context.ts';
import { KeyDateKindEnum, Money, money, PropertyTypeEnum, decimalString } from './common.ts';
import { Viewer } from './viewer.ts';
import { Activity, KeyDate } from './workflow.ts';
import { Lease } from './lease.ts';

// The portfolio at a glance: the dashboard's figures, computed in the database over the
// signed-in person's view of the leases (shared rows plus their own private changes).

interface Totals {
  live: number;
  passing: string;
  area: string;
  wault: string | null;
  holding: number;
  holdingRent: string;
  expiring: number;
  expiringRent: string;
}

// The reporting currency of the signed-in company (the portfolio is only reachable through Viewer).
async function reportingCurrency(ctx: Context): Promise<string> {
  return (await ctx.loaders.tenant.load(ctx.session!.tenantId))!.reporting_currency;
}

// One round trip for the headline figures; the dashboard asks for them all at once.
function totals(ctx: Context): Promise<Totals> {
  let pending = totalsByRequest.get(ctx);
  if (pending) return pending;
  pending = sql<Totals>`
    SELECT
      count(*) FILTER (WHERE status IN ('ACTIVE', 'HOLDING_OVER'))::int AS live,
      coalesce(sum(annual_rent_reporting) FILTER (WHERE status IN ('ACTIVE', 'HOLDING_OVER')), 0)::text AS passing,
      coalesce(sum(area_sqm) FILTER (WHERE status IN ('ACTIVE', 'HOLDING_OVER')), 0)::text AS area,
      (sum(annual_rent_reporting * greatest(expiry_date::date - ${ctx.today}::date, 0) / 365.25) FILTER (WHERE status = 'ACTIVE')
        / nullif(sum(annual_rent_reporting) FILTER (WHERE status = 'ACTIVE'), 0))::numeric(8, 2)::text AS wault,
      count(*) FILTER (WHERE status = 'HOLDING_OVER')::int AS holding,
      coalesce(sum(annual_rent_reporting) FILTER (WHERE status = 'HOLDING_OVER'), 0)::text AS "holdingRent",
      count(*) FILTER (WHERE status = 'ACTIVE' AND expiry_date <= ${addDays(ctx.today, 365)})::int AS expiring,
      coalesce(sum(annual_rent_reporting) FILTER (WHERE status = 'ACTIVE' AND expiry_date <= ${addDays(ctx.today, 365)}), 0)::text AS "expiringRent"
    FROM v_lease
  `.execute(ctx.tx).then((r) => r.rows[0]!);
  totalsByRequest.set(ctx, pending);
  return pending;
}
const totalsByRequest = new WeakMap<Context, Promise<Totals>>();

interface Bucket { label: string; year: number | null; leases: number; rent: string }
interface Slice { key: string; leases: number; rent: string; share: string }

const ExpiryBucket = builder.objectRef<Bucket>('ExpiryBucket').implement({
  description: 'Leases (active or holding over) whose expiry falls in one calendar year; the last bucket holds every later year.',
  fields: (t) => ({
    year: t.int({ nullable: true, description: 'Null for the open-ended last bucket.', resolve: (b) => b.year }),
    from: t.int({ description: 'First year in the bucket.', resolve: (b) => Number(b.label) }),
    leases: t.exposeInt('leases'),
    passingRent: t.field({ type: Money, resolve: async (b, _a, ctx) => money(b.rent, await reportingCurrency(ctx)) }),
  }),
});

const RentShare = builder.objectRef<Slice>('RentShare').implement({
  description: 'Passing rent (in the reporting currency) for one country or property type, with its share of the whole.',
  fields: (t) => ({
    leases: t.exposeInt('leases'),
    passingRent: t.field({ type: Money, resolve: async (s, _a, ctx) => money(s.rent, await reportingCurrency(ctx)) }),
    share: t.field({ type: 'Decimal', description: 'Fraction of total passing rent, 0 to 1.', resolve: (s) => decimalString(s.share) }),
  }),
});

const CountryRent = builder.objectRef<Slice>('CountryRent').implement({
  fields: (t) => ({
    countryCode: t.field({ type: 'CountryCode', resolve: (s) => s.key }),
    rent: t.field({ type: RentShare, resolve: (s) => s }),
  }),
});

const TypeRent = builder.objectRef<Slice>('TypeRent').implement({
  fields: (t) => ({
    propertyType: t.field({ type: PropertyTypeEnum, resolve: (s) => s.key as 'OFFICE' }),
    rent: t.field({ type: RentShare, resolve: (s) => s }),
  }),
});

async function shares(ctx: Context, column: 'country_code' | 'property_type'): Promise<Slice[]> {
  const r = await sql<Slice>`
    SELECT ${sql.ref(column)} AS key, count(*)::int AS leases, sum(annual_rent_reporting)::text AS rent,
      (sum(annual_rent_reporting) / nullif(sum(sum(annual_rent_reporting)) OVER (), 0))::numeric(6, 4)::text AS share
    FROM v_lease WHERE status IN ('ACTIVE', 'HOLDING_OVER')
    GROUP BY 1 ORDER BY sum(annual_rent_reporting) DESC
  `.execute(ctx.tx);
  return r.rows;
}

interface Week { start: string; count: number }
const KeyDateWeek = builder.objectRef<Week>('KeyDateWeek').implement({
  description: 'Open key dates falling due in one week (seven days from start).',
  fields: (t) => ({
    start: t.field({ type: 'Date', resolve: (w) => w.start }),
    count: t.exposeInt('count'),
  }),
});

// Decisions with a deadline: notice dates for break and renewal options, rent reviews to agree and
// expiries, open and due within the window (or already overdue), with the rent each one puts at stake.
interface AttentionRow { key_date_id: string; rent: string; has_task: boolean }

const AttentionItem = builder.objectRef<AttentionRow>('AttentionItem').implement({
  fields: (t) => ({
    keyDate: t.field({ type: KeyDate, resolve: async (a, _x, ctx) => (await ctx.tx.selectFrom('v_key_date').selectAll().where('key_date_id', '=', a.key_date_id).executeTakeFirst())! }),
    rentAtStake: t.field({ type: Money, description: 'The lease’s passing rent a year, in the reporting currency.', resolve: async (a, _x, ctx) => money(a.rent, await reportingCurrency(ctx)) }),
    hasOpenTask: t.boolean({ description: 'Someone already has a task open for this date.', resolve: (a) => a.has_task }),
  }),
});

interface AttentionWindow { label: number; from: number | null; count: number; rent: string }
const AttentionBucket = builder.objectRef<AttentionWindow>('AttentionBucket').implement({
  description: 'Decisions due in a band of days from today (fromDays null and withinDays 0: already overdue).',
  fields: (t) => ({
    withinDays: t.int({ description: 'The band’s last day.', resolve: (b) => b.label }),
    fromDays: t.int({ nullable: true, description: 'The band’s first day; null for the overdue bucket.', resolve: (b) => b.from }),
    count: t.exposeInt('count'),
    rentAtStake: t.field({ type: Money, resolve: async (b, _x, ctx) => money(b.rent, await reportingCurrency(ctx)) }),
  }),
});

interface KindRow { kind: string; n: number; next_id: string }
const KeyDateKindSummary = builder.objectRef<KindRow>('KeyDateKindSummary').implement({
  description: 'One kind of key date: how many are open in the next 90 days, and the soonest.',
  fields: (t) => ({
    kind: t.field({ type: KeyDateKindEnum, resolve: (k) => k.kind as 'EXPIRY' }),
    count: t.exposeInt('n'),
    next: t.field({ type: KeyDate, resolve: async (k, _x, ctx) => (await ctx.tx.selectFrom('v_key_date').selectAll().where('key_date_id', '=', k.next_id).executeTakeFirst())! }),
  }),
});

const DECISION_KINDS = sql`('BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'EXPIRY')`;

const Portfolio = builder.objectRef<Record<string, never>>('Portfolio').implement({
  description: 'Headline figures for the company’s portfolio, in its reporting currency.',
  fields: (t) => ({
    liveLeases: t.int({ description: 'Leases active or holding over.', resolve: async (_p, _a, ctx) => (await totals(ctx)).live }),
    passingRent: t.field({ type: Money, description: 'Annual passing rent of live leases.', resolve: async (_p, _a, ctx) => money((await totals(ctx)).passing, await reportingCurrency(ctx)) }),
    areaSqm: t.field({ type: 'Decimal', resolve: async (_p, _a, ctx) => decimalString((await totals(ctx)).area) }),
    wault: t.field({
      type: 'Decimal', nullable: true,
      description: 'Weighted average unexpired lease term in years, weighted by passing rent (active leases).',
      resolve: async (_p, _a, ctx) => { const w = (await totals(ctx)).wault; return w === null ? null : decimalString(w); },
    }),
    holdingOver: t.int({ resolve: async (_p, _a, ctx) => (await totals(ctx)).holding }),
    holdingOverRent: t.field({ type: Money, resolve: async (_p, _a, ctx) => money((await totals(ctx)).holdingRent, await reportingCurrency(ctx)) }),
    expiringIn12Months: t.int({ resolve: async (_p, _a, ctx) => (await totals(ctx)).expiring }),
    expiringIn12MonthsRent: t.field({ type: Money, resolve: async (_p, _a, ctx) => money((await totals(ctx)).expiringRent, await reportingCurrency(ctx)) }),
    keyDatesDue: t.int({
      args: { withinDays: t.arg.int({ required: false, defaultValue: 90 }) },
      description: 'Upcoming key dates due from today within the given days.',
      resolve: async (_p, args, ctx) => {
        const r = await ctx.tx.selectFrom('v_key_date').select(sql<number>`count(*)::int`.as('n'))
          .where('status', '=', 'UPCOMING').where('due_on', '>=', ctx.today).where('due_on', '<=', addDays(ctx.today, Math.min(Math.max(args.withinDays ?? 90, 1), 730)))
          .executeTakeFirstOrThrow();
        return r.n;
      },
    }),
    overdueKeyDates: t.int({
      description: 'Key dates of every kind still open after their due date (attentionBuckets counts only the decisions among them).',
      resolve: async (_p, _a, ctx) => (await ctx.tx.selectFrom('v_key_date').select(sql<number>`count(*)::int`.as('n'))
        .where('status', '=', 'UPCOMING').where('due_on', '<', ctx.today).executeTakeFirstOrThrow()).n,
    }),
    expiryProfile: t.field({
      type: [ExpiryBucket],
      description: 'Expiries by year, from this year: ten single years, then everything later.',
      resolve: async (_p, _a, ctx) => {
        const thisYear = Number(ctx.today.slice(0, 4));
        const r = await sql<{ y: number; leases: number; rent: string }>`
          SELECT least(extract(year FROM expiry_date::date)::int, ${thisYear + 10}) AS y, count(*)::int AS leases,
            sum(annual_rent_reporting)::text AS rent
          FROM v_lease WHERE status = 'ACTIVE' OR status = 'HOLDING_OVER'
          GROUP BY 1 ORDER BY 1
        `.execute(ctx.tx);
        const byYear = new Map(r.rows.map((row) => [Math.max(row.y, thisYear), row]));
        // Holding-over leases expired before this year count in this year's bucket.
        const early = r.rows.filter((row) => row.y < thisYear);
        return Array.from({ length: 11 }, (_, i) => {
          const year = thisYear + i;
          const row = byYear.get(year);
          let leases = row && row.y === year ? row.leases : 0;
          let rent = row && row.y === year ? row.rent : '0';
          if (i === 0) for (const e of early) { leases += e.leases; rent = String(Number(rent) + Number(e.rent)); }
          return { label: String(year), year: i === 10 ? null : year, leases, rent };
        });
      },
    }),
    keyDateWeeks: t.field({
      type: [KeyDateWeek],
      description: 'Open key dates per week for the next 13 weeks, starting today: the 90-day view at a glance.',
      resolve: async (_p, _a, ctx) => {
        const r = await sql<{ w: number; n: number }>`
          SELECT ((due_on::date - ${ctx.today}::date) / 7)::int AS w, count(*)::int AS n
          FROM v_key_date WHERE status = 'UPCOMING' AND due_on >= ${ctx.today} AND due_on < ${addDays(ctx.today, 91)}
          GROUP BY 1
        `.execute(ctx.tx);
        const byWeek = new Map(r.rows.map((row) => [row.w, row.n]));
        return Array.from({ length: 13 }, (_, i) => ({ start: addDays(ctx.today, i * 7), count: byWeek.get(i) ?? 0 }));
      },
    }),
    attentionBuckets: t.field({
      type: [AttentionBucket],
      description: 'Overdue decisions, then exclusive bands: due in 0–30, 31–60 and 61–90 days.',
      resolve: async (_p, _a, ctx) => {
        const r = await sql<{ overdue: number; overdue_rent: string; d30: number; r30: string; d60: number; r60: string; d90: number; r90: string }>`
          SELECT
            count(*) FILTER (WHERE k.due_on < ${ctx.today})::int AS overdue,
            coalesce(sum(l.annual_rent_reporting) FILTER (WHERE k.due_on < ${ctx.today}), 0)::text AS overdue_rent,
            count(*) FILTER (WHERE k.due_on >= ${ctx.today} AND k.due_on <= ${addDays(ctx.today, 30)})::int AS d30,
            coalesce(sum(l.annual_rent_reporting) FILTER (WHERE k.due_on >= ${ctx.today} AND k.due_on <= ${addDays(ctx.today, 30)}), 0)::text AS r30,
            count(*) FILTER (WHERE k.due_on > ${addDays(ctx.today, 30)} AND k.due_on <= ${addDays(ctx.today, 60)})::int AS d60,
            coalesce(sum(l.annual_rent_reporting) FILTER (WHERE k.due_on > ${addDays(ctx.today, 30)} AND k.due_on <= ${addDays(ctx.today, 60)}), 0)::text AS r60,
            count(*) FILTER (WHERE k.due_on > ${addDays(ctx.today, 60)} AND k.due_on <= ${addDays(ctx.today, 90)})::int AS d90,
            coalesce(sum(l.annual_rent_reporting) FILTER (WHERE k.due_on > ${addDays(ctx.today, 60)} AND k.due_on <= ${addDays(ctx.today, 90)}), 0)::text AS r90
          FROM v_key_date k JOIN v_lease l ON l.lease_id = k.lease_id
          WHERE k.status = 'UPCOMING' AND k.kind IN ${DECISION_KINDS} AND k.due_on <= ${addDays(ctx.today, 90)}
        `.execute(ctx.tx);
        const x = r.rows[0]!;
        return [
          { label: 0, from: null, count: x.overdue, rent: x.overdue_rent },
          { label: 30, from: 0, count: x.d30, rent: x.r30 },
          { label: 60, from: 31, count: x.d60, rent: x.r60 },
          { label: 90, from: 61, count: x.d90, rent: x.r90 },
        ];
      },
    }),
    attention: t.field({
      type: [AttentionItem],
      args: { first: t.arg.int({ required: false, defaultValue: 6 }) },
      description: 'The decisions to make first: overdue ones by rent at stake, then upcoming ones by deadline.',
      resolve: async (_p, args, ctx) => {
        const r = await sql<AttentionRow>`
          SELECT k.key_date_id, l.annual_rent_reporting::text AS rent,
            EXISTS (SELECT 1 FROM v_task t WHERE t.key_date_id = k.key_date_id AND t.status IN ('TODO', 'IN_PROGRESS')) AS has_task
          FROM v_key_date k JOIN v_lease l ON l.lease_id = k.lease_id
          WHERE k.status = 'UPCOMING' AND k.kind IN ${DECISION_KINDS} AND k.due_on <= ${addDays(ctx.today, 90)}
          -- Overdue first, the largest rent at stake leading; then upcoming by deadline.
          ORDER BY (k.due_on < ${ctx.today}) DESC,
            CASE WHEN k.due_on < ${ctx.today} THEN l.annual_rent_reporting END DESC NULLS LAST,
            k.due_on, l.annual_rent_reporting DESC, k.key_date_id
          LIMIT ${Math.min(Math.max(args.first ?? 6, 1), 25)}
        `.execute(ctx.tx);
        return r.rows;
      },
    }),
    keyDateKinds: t.field({
      type: [KeyDateKindSummary],
      description: 'Per kind of key date, the open ones due in the next 90 days and the soonest of them; soonest kind first.',
      resolve: async (_p, _a, ctx) => {
        const r = await sql<KindRow & { due: string }>`
          SELECT DISTINCT ON (kind) kind, key_date_id AS next_id, due_on AS due,
            count(*) OVER (PARTITION BY kind)::int AS n
          FROM v_key_date
          WHERE status = 'UPCOMING' AND due_on >= ${ctx.today} AND due_on <= ${addDays(ctx.today, 90)}
          ORDER BY kind, due_on, key_date_id
        `.execute(ctx.tx);
        return r.rows.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
      },
    }),
    rentByCountry: t.field({ type: [CountryRent], resolve: (_p, _a, ctx) => shares(ctx, 'country_code') }),
    rentByType: t.field({ type: [TypeRent], resolve: (_p, _a, ctx) => shares(ctx, 'property_type') }),
    upcomingKeyDates: t.field({
      type: [KeyDate],
      args: { first: t.arg.int({ required: false, defaultValue: 8 }), withinDays: t.arg.int({ required: false, defaultValue: 90 }) },
      description: 'The soonest open key dates, overdue first.',
      resolve: (_p, args, ctx) => ctx.tx.selectFrom('v_key_date').selectAll()
        .where('status', '=', 'UPCOMING').where('due_on', '<=', addDays(ctx.today, Math.min(Math.max(args.withinDays ?? 90, 1), 730)))
        .orderBy('due_on').orderBy('key_date_id').limit(Math.min(Math.max(args.first ?? 8, 1), 25)).execute(),
    }),
    recentActivity: t.field({
      type: [Activity],
      args: { first: t.arg.int({ required: false, defaultValue: 8 }) },
      description: 'The latest changes across the portfolio, newest first.',
      resolve: (_p, args, ctx) => ctx.tx.selectFrom('activity').selectAll()
        .where('created_at', '<=', sql<Date>`now()`)
        .orderBy('created_at', 'desc').orderBy('id', 'desc').limit(Math.min(Math.max(args.first ?? 8, 1), 25)).execute(),
    }),
  }),
});

builder.objectFields(Viewer, (t) => ({
  portfolio: t.field({ type: Portfolio, complexity: 40, resolve: () => ({}) }),
}));

builder.objectFields(Activity, (t) => ({
  lease: t.field({ type: Lease, nullable: true, resolve: (a, _args, ctx) => (a.lease_id ? ctx.loaders.lease.load(a.lease_id) : null) }),
}));
