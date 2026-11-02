import { randomUUID } from 'node:crypto';
import { editableRowId } from '../../domain/overlay.ts';
import { builder } from '../builder.ts';
import { chargeWrite, requireRole, type Context } from '../context.ts';
import { NotFound, StaleVersion, ValidationFailed, WRITE_ERRORS } from '../errors.ts';
import { KeyDateStatusEnum } from '../types/common.ts';
import { User } from '../types/tenant.ts';
import { KeyDate } from '../types/workflow.ts';

const loadKeyDate = async (ctx: Context, id: string) =>
  (await ctx.tx.selectFrom('v_key_date').selectAll().where('key_date_id', '=', id).executeTakeFirst()) ?? null;

// Reminders are days before the date: whole numbers from 1 to 365, at most six, latest first.
function checkReminders(days: readonly number[]): number[] {
  const clean = [...new Set(days)].sort((a, b) => b - a);
  if (clean.length > 6 || clean.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) {
    throw new ValidationFailed([{ path: 'remindDays', code: 'invalid', message: 'Choose up to six reminders, each 1 to 365 days before.', step: null }]);
  }
  return clean;
}

builder.relayMutationField(
  'updateKeyDate',
  {
    inputFields: (t) => ({
      id: t.globalID({ required: true, for: KeyDate }),
      version: t.int({ required: true }),
      status: t.field({ type: KeyDateStatusEnum, required: false, description: 'ACTIONED when done, DISMISSED when not needed, UPCOMING to reopen.' }),
      remindDays: t.intList({ required: false, description: 'Days before the date to remind the owner.' }),
      ownerId: t.globalID({ required: false, for: User }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireRole(ctx, 'MANAGER');
      const current = await loadKeyDate(ctx, input.id.id);
      if (!current) throw new NotFound('The key date');
      if (current.version !== input.version) throw new StaleVersion(current.version);
      if (input.ownerId) {
        const u = await ctx.loaders.user.load(input.ownerId.id);
        if (!u || u.tenant_id !== session.tenantId || u.role === 'VIEWER') {
          throw new ValidationFailed([{ path: 'ownerId', code: 'unknown_user', message: 'Choose a manager or admin from your company.', step: null }]);
        }
      }
      const remind = input.remindDays ? checkReminders(input.remindDays) : null;
      await chargeWrite(ctx);
      const { id } = await editableRowId(ctx, 'key_date', current);
      await ctx.tx.updateTable('key_date').set({
        ...(input.status ? { status: input.status } : {}),
        ...(remind ? { remind_days: remind } : {}),
        ...(input.ownerId ? { owner_id: input.ownerId.id } : {}),
        version: current.version + 1,
      }).where('id', '=', id).execute();
      if (input.status && input.status !== current.status) {
        const verb = input.status === 'ACTIONED' ? 'KEY_DATE_ACTIONED' : input.status === 'DISMISSED' ? 'KEY_DATE_DISMISSED' : 'KEY_DATE_REOPENED';
        const word = input.status === 'ACTIONED' ? 'Done' : input.status === 'DISMISSED' ? 'Dismissed' : 'Reopened';
        await ctx.tx.insertInto('activity').values({
          id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: current.lease_id,
          actor_id: session.userId, verb, summary: `${word}: ${current.title}`, diff: null,
        }).execute();
      }
      return { keyDate: (await loadKeyDate(ctx, input.id.id))! };
    },
  },
  { outputFields: (t) => ({ keyDate: t.field({ type: KeyDate, resolve: (p) => p.keyDate }) }) },
);
