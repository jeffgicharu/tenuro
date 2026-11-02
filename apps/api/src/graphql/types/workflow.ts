import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { sql, type Selectable } from 'kysely';
import type { ActivityTable, Database, DocumentTable } from '../../db/types.ts';
import { daysBetween } from '../../domain/dates.ts';
import { builder } from '../builder.ts';
import { DocumentKindEnum, KeyDateKindEnum, KeyDateStatusEnum, TaskPriorityEnum, TaskStatusEnum } from './common.ts';
import { Lease } from './lease.ts';
import { User } from './tenant.ts';
import { viewIdIn } from '../../db/viewid.ts';

type KeyDateRow = Selectable<Database['v_key_date']>;
type TaskRow = Selectable<Database['v_task']>;
type DocumentRow = Omit<Selectable<DocumentTable>, 'content'>;
type ActivityRow = Selectable<ActivityTable>;

const DOCUMENT_COLUMNS = ['id', 'tenant_id', 'sandbox_id', 'lease_id', 'kind', 'title', 'filename', 'mime_type', 'size_bytes',
  'page_count', 'template', 'uploaded_by', 'created_at'] as const;

export const KeyDate = builder.node(builder.objectRef<KeyDateRow>('KeyDate'), {
  id: { resolve: (k) => k.key_date_id },
  loadMany: async (ids, ctx) => {
    const rows = await ctx.tx.selectFrom('v_key_date').selectAll().where(viewIdIn(ids as string[])).where('key_date_id', 'in', ids as string[]).execute();
    const map = new Map(rows.map((r) => [r.key_date_id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    kind: t.field({ type: KeyDateKindEnum, resolve: (k) => k.kind }),
    title: t.exposeString('title'),
    dueOn: t.field({ type: 'Date', resolve: (k) => k.due_on }),
    daysUntil: t.int({ resolve: (k, _a, ctx) => daysBetween(ctx.today, k.due_on) }),
    status: t.field({ type: KeyDateStatusEnum, resolve: (k) => k.status }),
    remindDays: t.intList({ resolve: (k) => k.remind_days }),
    version: t.exposeInt('version'),
    owner: t.field({ type: User, nullable: true, resolve: (k, _a, ctx) => (k.owner_id ? ctx.loaders.user.load(k.owner_id) : null) }),
    lease: t.field({ type: Lease, resolve: async (k, _a, ctx) => (await ctx.loaders.lease.load(k.lease_id))! }),
  }),
});

export const Task = builder.node(builder.objectRef<TaskRow>('Task'), {
  id: { resolve: (k) => k.task_id },
  loadMany: async (ids, ctx) => {
    const rows = await ctx.tx.selectFrom('v_task').selectAll().where(viewIdIn(ids as string[])).where('task_id', 'in', ids as string[]).execute();
    const map = new Map(rows.map((r) => [r.task_id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    status: t.field({ type: TaskStatusEnum, resolve: (k) => k.status }),
    priority: t.field({ type: TaskPriorityEnum, resolve: (k) => k.priority }),
    dueOn: t.field({ type: 'Date', nullable: true, resolve: (k) => k.due_on }),
    isOverdue: t.boolean({ resolve: (k, _a, ctx) => !!k.due_on && k.due_on < ctx.today && (k.status === 'TODO' || k.status === 'IN_PROGRESS') }),
    version: t.exposeInt('version'),
    assignee: t.field({ type: User, nullable: true, resolve: (k, _a, ctx) => (k.assignee_id ? ctx.loaders.user.load(k.assignee_id) : null) }),
    createdBy: t.field({ type: User, nullable: true, resolve: (k, _a, ctx) => (k.created_by ? ctx.loaders.user.load(k.created_by) : null) }),
    createdAt: t.field({ type: 'DateTime', resolve: (k) => k.created_at }),
    completedAt: t.field({ type: 'DateTime', nullable: true, resolve: (k) => k.completed_at }),
    lease: t.field({ type: Lease, nullable: true, resolve: (k, _a, ctx) => (k.lease_id ? ctx.loaders.lease.load(k.lease_id) : null) }),
    keyDate: t.field({
      type: KeyDate, nullable: true,
      resolve: async (k, _a, ctx) => (k.key_date_id
        ? ((await ctx.tx.selectFrom('v_key_date').selectAll().where(viewIdIn([k.key_date_id])).where('key_date_id', '=', k.key_date_id).executeTakeFirst()) ?? null)
        : null),
    }),
  }),
});

export const Document = builder.node(builder.objectRef<DocumentRow>('Document'), {
  id: { resolve: (d) => d.id },
  loadMany: async (ids, ctx) => {
    const rows = await ctx.tx.selectFrom('document').select(DOCUMENT_COLUMNS).where('id', 'in', ids as string[]).execute();
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    kind: t.field({ type: DocumentKindEnum, resolve: (d) => d.kind }),
    title: t.exposeString('title'),
    filename: t.exposeString('filename'),
    mimeType: t.string({
      description: 'Rendered documents are served as HTML (the agreement) or SVG (the plan).',
      resolve: (d) => (d.template === 'lease-agreement' || d.template === 'rent-review-memo' ? 'text/html' : d.template === 'floor-plan' ? 'image/svg+xml' : d.mime_type),
    }),
    sizeBytes: t.exposeInt('size_bytes'),
    pageCount: t.exposeInt('page_count', { nullable: true }),
    url: t.string({ description: 'Same-origin URL that streams the file for preview or download.', resolve: (d) => `/api/documents/${d.id}` }),
    generated: t.boolean({ description: 'True for documents rendered from the lease data.', resolve: (d) => d.template !== null }),
    uploadedBy: t.field({ type: User, nullable: true, resolve: (d, _a, ctx) => (d.uploaded_by ? ctx.loaders.user.load(d.uploaded_by) : null) }),
    createdAt: t.field({ type: 'DateTime', resolve: (d) => d.created_at }),
  }),
});

export const Activity = builder.node(builder.objectRef<ActivityRow>('Activity'), {
  id: { resolve: (a) => a.id },
  loadMany: async (ids, ctx) => {
    const rows = await ctx.tx.selectFrom('activity').selectAll().where('id', 'in', ids as string[]).execute();
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  },
  fields: (t) => ({
    verb: t.exposeString('verb'),
    summary: t.exposeString('summary'),
    diff: t.string({ nullable: true, description: 'JSON list of field changes, when the activity changed fields.', resolve: (a) => (a.diff ? JSON.stringify(a.diff) : null) }),
    actor: t.field({ type: User, nullable: true, resolve: (a, _a, ctx) => (a.actor_id ? ctx.loaders.user.load(a.actor_id) : null) }),
    createdAt: t.field({ type: 'DateTime', resolve: (a) => a.created_at }),
  }),
});

builder.objectFields(Lease, (t) => ({
  keyDates: t.connection({
    type: KeyDate,
    args: { includeClosed: t.arg.boolean({ required: false }) },
    resolve: async (l, args, ctx) => {
      let q = ctx.tx.selectFrom('v_key_date').where('lease_id', '=', l.lease_id);
      if (!args.includeClosed) q = q.where('status', '=', 'UPCOMING');
      const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 20, maxSize: 100, totalCount: n }, ({ limit, offset }) =>
        q.selectAll().orderBy('due_on').orderBy('key_date_id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
  tasks: t.connection({
    type: Task,
    args: { includeDone: t.arg.boolean({ required: false }) },
    resolve: async (l, args, ctx) => {
      let q = ctx.tx.selectFrom('v_task').where('lease_id', '=', l.lease_id);
      if (!args.includeDone) q = q.where('status', 'in', ['TODO', 'IN_PROGRESS']);
      const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 20, maxSize: 100, totalCount: n }, ({ limit, offset }) =>
        q.selectAll().orderBy(sql`status = 'DONE'`).orderBy('due_on', (ob) => ob.asc().nullsLast()).orderBy('task_id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
  documents: t.connection({
    type: Document,
    resolve: async (l, args, ctx) => {
      const q = ctx.tx.selectFrom('document').where('lease_id', '=', l.lease_id);
      const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 20, maxSize: 100, totalCount: n }, ({ limit, offset }) =>
        q.select(DOCUMENT_COLUMNS).orderBy('created_at', 'desc').orderBy('id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
  activity: t.connection({
    type: Activity,
    resolve: async (l, args, ctx) => {
      const q = ctx.tx.selectFrom('activity').where('lease_id', '=', l.lease_id);
      const [{ n }] = (await q.select(sql<number>`count(*)::int`.as('n')).execute()) as [{ n: number }];
      const page = await resolveOffsetConnection({ args, defaultSize: 15, maxSize: 100, totalCount: n }, ({ limit, offset }) =>
        q.selectAll().orderBy('created_at', 'desc').orderBy('id').limit(limit).offset(offset).execute());
      return { ...page, totalCount: n };
    },
  }),
}));
