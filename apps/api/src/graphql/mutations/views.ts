import { randomUUID } from 'node:crypto';
import { encodeGlobalID } from '@pothos/plugin-relay';
import { sql } from 'kysely';
import { editableRowId } from '../../domain/overlay.ts';
import { builder } from '../builder.ts';
import { chargeWrite, requireRole, requireSession } from '../context.ts';
import { NotFound, PermissionDenied, ValidationFailed, WRITE_ERRORS } from '../errors.ts';
import { ViewScopeEnum } from '../types/common.ts';
import { SavedView, Viewer } from '../types/viewer.ts';

const MAX_CONFIG = 8 * 1024;

function parseConfig(json: string): Record<string, unknown> {
  if (json.length > MAX_CONFIG) throw new ValidationFailed([{ path: 'config', code: 'too_long', message: 'This view has too many settings to save.', step: null }]);
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* reported below */ }
  throw new ValidationFailed([{ path: 'config', code: 'invalid', message: 'The view settings could not be read.', step: null }]);
}

// Personal views are open to every role, viewers included; shared company views need an admin.
builder.relayMutationField(
  'saveView',
  {
    inputFields: (t) => ({
      id: t.globalID({ required: false, for: SavedView }),
      scope: t.field({ type: ViewScopeEnum, required: true }),
      name: t.string({ required: true }),
      config: t.string({ required: true }),
      shared: t.boolean({ required: false }),
    }),
  },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireSession(ctx);
      const name = input.name.trim();
      if (!name || name.length > 60) throw new ValidationFailed([{ path: 'name', code: name ? 'too_long' : 'required', message: name ? 'Keep the name under 60 characters.' : 'Name the view.', step: null }]);
      const config = parseConfig(input.config);
      if (input.shared) requireRole(ctx, 'ADMIN');
      await chargeWrite(ctx);
      if (input.id) {
        const current = await ctx.tx.selectFrom('v_saved_view').selectAll().where('view_id', '=', input.id.id).executeTakeFirst();
        if (!current) throw new NotFound('The view');
        if (current.owner_id === null && session.role !== 'ADMIN') throw new PermissionDenied('ADMIN');
        if (current.owner_id !== null && current.owner_id !== session.userId) throw new NotFound('The view');
        const { id } = await editableRowId(ctx, 'saved_view', current);
        await ctx.tx.updateTable('saved_view').set({ name, config: JSON.stringify(config), version: sql`version + 1` }).where('id', '=', id).execute();
        return { viewId: input.id.id };
      }
      const count = await ctx.tx.selectFrom('v_saved_view').select(sql<number>`count(*)::int`.as('n')).where('owner_id', '=', session.userId).executeTakeFirstOrThrow();
      if (count.n >= 30) throw new ValidationFailed([{ path: 'name', code: 'too_many', message: 'You can keep up to 30 saved views.', step: null }]);
      const id = randomUUID();
      await ctx.tx.insertInto('saved_view').values({
        id, tenant_id: session.tenantId, sandbox_id: session.sandboxId, origin_id: null, deleted_at: null,
        owner_id: input.shared ? null : session.userId, scope: input.scope, name, config: JSON.stringify(config), position: 100 + count.n,
      }).execute();
      return { viewId: id };
    },
  },
  {
    outputFields: (t) => ({
      view: t.field({
        type: SavedView,
        resolve: async (p, _a, ctx) => (await ctx.tx.selectFrom('v_saved_view').selectAll().where('view_id', '=', p.viewId).executeTakeFirstOrThrow()),
      }),
      viewer: t.field({ type: Viewer, resolve: (_p, _a, ctx) => ctx.session! }),
    }),
  },
);

builder.relayMutationField(
  'deleteView',
  { inputFields: (t) => ({ id: t.globalID({ required: true, for: SavedView }) }) },
  {
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, { input }, ctx) => {
      const session = requireSession(ctx);
      const current = await ctx.tx.selectFrom('v_saved_view').selectAll().where('view_id', '=', input.id.id).executeTakeFirst();
      if (!current || (current.owner_id !== null && current.owner_id !== session.userId)) throw new NotFound('The view');
      if (current.owner_id === null) requireRole(ctx, 'ADMIN');
      await chargeWrite(ctx);
      const { id } = await editableRowId(ctx, 'saved_view', current);
      await ctx.tx.updateTable('saved_view').set({ deleted_at: sql<Date>`now()` as unknown as Date }).where('id', '=', id).execute();
      return { deletedId: input.id.id };
    },
  },
  { outputFields: (t) => ({ deletedViewId: t.id({ resolve: (p) => encodeGlobalID('SavedView', p.deletedId) }) }) },
);
