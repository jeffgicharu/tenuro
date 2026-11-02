import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { editableRowId } from '../../domain/overlay.ts';
import { builder } from '../builder.ts';
import { chargeWrite, requireRole, type Context } from '../context.ts';
import { NotFound, StaleVersion, ValidationFailed, WRITE_ERRORS } from '../errors.ts';
import { TaskPriorityEnum, TaskStatusEnum } from '../types/common.ts';
import { Lease } from '../types/lease.ts';
import { User } from '../types/tenant.ts';
import { KeyDate, Task } from '../types/workflow.ts';
import { viewIdIn } from '../../db/viewid.ts';

const loadTask = async (ctx: Context, id: string) =>
  (await ctx.tx.selectFrom('v_task').selectAll().where(viewIdIn([id])).where('task_id', '=', id).executeTakeFirst()) ?? null;

async function checkAssignee(ctx: Context, userId: string | null | undefined) {
  if (!userId) return;
  const u = await ctx.loaders.user.load(userId);
  if (!u || u.tenant_id !== ctx.session!.tenantId) {
    throw new ValidationFailed([{ path: 'assigneeId', code: 'unknown_user', message: 'Choose someone from your company.', step: null }]);
  }
}

function checkTitle(title: string) {
  const t = title.trim();
  if (!t) throw new ValidationFailed([{ path: 'title', code: 'required', message: 'Give the task a title.', step: null }]);
  if (t.length > 200) throw new ValidationFailed([{ path: 'title', code: 'too_long', message: 'Keep the title under 200 characters.', step: null }]);
  return t;
}

builder.relayMutationField(
  'createTask',
  {
    inputFields: (t) => ({
      leaseId: t.globalID({ required: false, for: Lease }),
      keyDateId: t.globalID({ required: false, for: KeyDate }),
      title: t.string({ required: true }),
      description: t.string({ required: false }),
      assigneeId: t.globalID({ required: false, for: User }),
      dueOn: t.field({ type: 'Date', required: false }),
      priority: t.field({ type: TaskPriorityEnum, required: false }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const title = checkTitle(input.title);
      if (input.description && input.description.length > 4000) {
        throw new ValidationFailed([{ path: 'description', code: 'too_long', message: 'Keep the description under 4,000 characters.', step: null }]);
      }
      await checkAssignee(ctx, input.assigneeId?.id);
      if (input.leaseId && !(await ctx.loaders.lease.load(input.leaseId.id))) throw new NotFound('The lease');
      await chargeWrite(ctx);
      const id = randomUUID();
      await ctx.tx.insertInto('task').values({
        id, tenant_id: session.tenantId, sandbox_id: session.sandboxId, origin_id: null, deleted_at: null,
        lease_id: input.leaseId?.id ?? null, key_date_id: input.keyDateId?.id ?? null, title,
        description: input.description?.trim() || null, assignee_id: input.assigneeId?.id ?? null, due_on: input.dueOn ?? null,
        priority: input.priority ?? 'NORMAL', status: 'TODO', created_by: session.userId,
      }).execute();
      if (input.leaseId) {
        await ctx.tx.insertInto('activity').values({
          id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: input.leaseId.id,
          actor_id: session.userId, verb: 'TASK_CREATED', summary: `Task added: ${title}`, diff: null,
        }).execute();
      }
      return { task: (await loadTask(ctx, id))! };
    },
  },
  { outputFields: (t) => ({ task: t.field({ type: Task, resolve: (p) => p.task }) }) },
);

builder.relayMutationField(
  'updateTask',
  {
    inputFields: (t) => ({
      id: t.globalID({ required: true, for: Task }),
      version: t.int({ required: true }),
      title: t.string({ required: false }),
      status: t.field({ type: TaskStatusEnum, required: false }),
      priority: t.field({ type: TaskPriorityEnum, required: false }),
      assigneeId: t.globalID({ required: false, for: User }),
      clearAssignee: t.boolean({ required: false }),
      dueOn: t.field({ type: 'Date', required: false }),
      clearDueOn: t.boolean({ required: false }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const current = await loadTask(ctx, input.id.id);
      if (!current) throw new NotFound('The task');
      if (current.version !== input.version) throw new StaleVersion(current.version);
      await checkAssignee(ctx, input.assigneeId?.id);
      await chargeWrite(ctx);
      const { id } = await editableRowId(ctx, 'task', current);
      const status = input.status ?? current.status;
      await ctx.tx.updateTable('task').set({
        ...(input.title != null ? { title: checkTitle(input.title) } : {}),
        ...(input.status ? { status, completed_at: status === 'DONE' ? (sql<Date>`now()` as unknown as Date) : null } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assigneeId ? { assignee_id: input.assigneeId.id } : input.clearAssignee ? { assignee_id: null } : {}),
        ...(input.dueOn ? { due_on: input.dueOn } : input.clearDueOn ? { due_on: null } : {}),
        version: current.version + 1,
      }).where('id', '=', id).execute();
      if (input.status === 'DONE' && current.status !== 'DONE' && current.lease_id) {
        await ctx.tx.insertInto('activity').values({
          id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: current.lease_id,
          actor_id: session.userId, verb: 'TASK_COMPLETED', summary: `Task completed: ${current.title}`, diff: null,
        }).execute();
      }
      return { task: (await loadTask(ctx, input.id.id))! };
    },
  },
  { outputFields: (t) => ({ task: t.field({ type: Task, resolve: (p) => p.task }) }) },
);

builder.objectFields(Lease, (t) => ({
  assignableUsers: t.field({
    type: [User],
    description: 'People in this company who can own tasks.',
    resolve: async (l, _a, ctx) => ctx.tx.selectFrom('app_user').selectAll().where('tenant_id', '=', l.tenant_id)
      .where('role', '!=', 'VIEWER').orderBy('display_name').execute(),
  }),
}));
