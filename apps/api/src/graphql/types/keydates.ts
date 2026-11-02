import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { sql } from 'kysely';
import { addDays } from '../../domain/dates.ts';
import { builder } from '../builder.ts';
import type { Context } from '../context.ts';
import { KeyDateKindEnum, KeyDateStatusEnum } from './common.ts';
import { Viewer } from './viewer.ts';
import { KeyDate } from './workflow.ts';

// The key dates across the whole portfolio: the list, the month calendar and the reminders due.
// Everything reads the person's own view (shared rows plus their private changes).

type Kind = 'BREAK_NOTICE' | 'RENEWAL_NOTICE' | 'RENT_REVIEW' | 'EXPIRY' | 'DEPOSIT_RETURN' | 'INSURANCE' | 'CUSTOM';
type Status = 'UPCOMING' | 'ACTIONED' | 'DISMISSED';

const KeyDateFilter = builder.inputType('KeyDateFilter', {
  fields: (t) => ({
    kinds: t.field({ type: [KeyDateKindEnum], required: false }),
    statuses: t.field({ type: [KeyDateStatusEnum], required: false, description: 'Defaults to open (UPCOMING) dates.' }),
    from: t.field({ type: 'Date', required: false, description: 'Due on or after.' }),
    to: t.field({ type: 'Date', required: false, description: 'Due on or before.' }),
    overdue: t.boolean({ required: false, description: 'Only open dates already past due.' }),
    mine: t.boolean({ required: false, description: 'Only dates the signed-in person owns.' }),
    search: t.string({ required: false, description: 'Lease reference, property or city.' }),
  }),
});

interface FilterInput { kinds?: Kind[] | null; statuses?: Status[] | null; from?: string | null; to?: string | null; overdue?: boolean | null; mine?: boolean | null; search?: string | null }

function filtered(ctx: Context, f: FilterInput | null | undefined) {
  let q = ctx.tx.selectFrom('v_key_date as k').innerJoin('v_lease as l', 'l.lease_id', 'k.lease_id');
  const statuses = f?.statuses?.length ? f.statuses : ['UPCOMING' as const];
  q = q.where('k.status', 'in', statuses);
  if (f?.kinds?.length) q = q.where('k.kind', 'in', f.kinds);
  if (f?.from) q = q.where('k.due_on', '>=', f.from);
  if (f?.to) q = q.where('k.due_on', '<=', f.to);
  if (f?.overdue) q = q.where('k.due_on', '<', ctx.today).where('k.status', '=', 'UPCOMING');
  if (f?.mine && ctx.session) q = q.where('k.owner_id', '=', ctx.session.userId);
  const s = f?.search?.trim();
  if (s) {
    const term = `%${s.slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    q = q.where((eb) => eb.or([eb('l.reference', 'ilike', term), eb('l.property_name', 'ilike', term), eb('l.city', 'ilike', term)]));
  }
  return q;
}

interface DayRow { day: string; kind: Kind; n: number; overdue: number }
const CalendarDay = builder.objectRef<{ day: string; total: number; overdue: number; kinds: { kind: Kind; count: number }[] }>('KeyDateDay').implement({
  description: 'Open key dates falling on one day, by kind.',
  fields: (t) => ({
    date: t.field({ type: 'Date', resolve: (d) => d.day }),
    total: t.exposeInt('total'),
    overdue: t.exposeInt('overdue'),
    kinds: t.field({
      type: [builder.objectRef<{ kind: Kind; count: number }>('KeyDateKindCount').implement({
        fields: (u) => ({ kind: u.field({ type: KeyDateKindEnum, resolve: (k) => k.kind }), count: u.exposeInt('count') }),
      })],
      resolve: (d) => d.kinds,
    }),
  }),
});

const Reminder = builder.objectRef<{ key_date_id: string; remind_on: string; days_before: number }>('KeyDateReminder').implement({
  description: 'A reminder falling due: a number of days before a key date.',
  fields: (t) => ({
    remindOn: t.field({ type: 'Date', resolve: (r) => r.remind_on }),
    daysBefore: t.exposeInt('days_before'),
    keyDate: t.field({ type: KeyDate, resolve: async (r, _a, ctx) => (await ctx.tx.selectFrom('v_key_date').selectAll().where('key_date_id', '=', r.key_date_id).executeTakeFirst())! }),
  }),
});

builder.objectFields(Viewer, (t) => ({
  keyDates: t.connection({
    type: KeyDate,
    args: { filter: t.arg({ type: KeyDateFilter, required: false }) },
    complexity: (args) => ({ field: 4, multiplier: Math.min(args.first ?? 50, 200) }),
    description: 'Key dates across the portfolio, soonest first (open ones by default).',
    resolve: async (_s, args, ctx) => {
      const base = filtered(ctx, args.filter as FilterInput | null);
      const [{ n }] = (await base.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 50, maxSize: 200, totalCount: n }, ({ limit, offset }) =>
        base.selectAll('k').orderBy('k.due_on').orderBy('l.annual_rent_reporting', 'desc').orderBy('k.key_date_id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
  keyDateCalendar: t.field({
    type: [CalendarDay],
    args: {
      from: t.arg({ type: 'Date', required: true }),
      to: t.arg({ type: 'Date', required: true }),
      filter: t.arg({ type: KeyDateFilter, required: false }),
    },
    description: 'Open key dates per day between two dates (at most 62 days), for the month calendar.',
    resolve: async (_s, args, ctx) => {
      const to = args.to < addDays(args.from, 62) ? args.to : addDays(args.from, 62);
      const f = { ...((args.filter as FilterInput | null) ?? {}), from: args.from, to };
      const rows = await filtered(ctx, f)
        .select([
          sql<string>`k.due_on`.as('day'), 'k.kind as kind', sql<number>`count(*)::int`.as('n'),
          sql<number>`count(*) FILTER (WHERE k.status = 'UPCOMING' AND k.due_on < ${ctx.today})::int`.as('overdue'),
        ])
        .groupBy(['k.due_on', 'k.kind']).orderBy('k.due_on').execute() as DayRow[];
      const byDay = new Map<string, { day: string; total: number; overdue: number; kinds: { kind: Kind; count: number }[] }>();
      for (const r of rows) {
        const d = byDay.get(r.day) ?? { day: r.day, total: 0, overdue: 0, kinds: [] };
        d.total += r.n; d.overdue += r.overdue; d.kinds.push({ kind: r.kind, count: r.n });
        byDay.set(r.day, d);
      }
      return [...byDay.values()];
    },
  }),
  remindersDue: t.field({
    type: [Reminder],
    args: { withinDays: t.arg.int({ required: false, defaultValue: 7 }), first: t.arg.int({ required: false, defaultValue: 20 }) },
    description: 'Reminders falling due from today within the window, on open key dates the person owns.',
    resolve: async (s, args, ctx) => {
      const within = Math.min(Math.max(args.withinDays ?? 7, 1), 60);
      const r = await sql<{ key_date_id: string; remind_on: string; days_before: number }>`
        SELECT k.key_date_id, (k.due_on::date - d)::text AS remind_on, d AS days_before
        FROM v_key_date k CROSS JOIN LATERAL unnest(k.remind_days) AS d
        WHERE k.status = 'UPCOMING' AND k.owner_id = ${s.userId}
          AND (k.due_on::date - d) BETWEEN ${ctx.today}::date AND ${addDays(ctx.today, within)}::date
        ORDER BY 2, k.due_on, k.key_date_id
        LIMIT ${Math.min(Math.max(args.first ?? 20, 1), 50)}
      `.execute(ctx.tx);
      return r.rows;
    },
  }),
}));
