import { builder } from '../builder.ts';
import { requireSession } from '../context.ts';
import { WRITE_ERRORS } from '../errors.ts';
import { Viewer } from '../types/viewer.ts';

const SANDBOX_TABLES = [
  'notification', 'activity', 'document', 'task', 'key_date', 'lease_draft', 'lease_modification', 'saved_view',
  'deposit', 'lease_option', 'escalation', 'rent_step', 'lease_party', 'lease', 'property',
] as const;

const ResetMySandboxPayload = builder.objectRef<{ ok: true }>('ResetMySandboxPayload').implement({
  fields: (t) => ({ viewer: t.field({ type: Viewer, resolve: (_p, _a, ctx) => ctx.session! }) }),
});

builder.mutationField('resetMySandbox', (t) =>
  t.field({
    type: ResetMySandboxPayload,
    description: 'Discards every change the visitor made, returning their copy to the company’s shared data.',
    errors: { types: WRITE_ERRORS },
    resolve: async (_root, _args, ctx) => {
      const session = requireSession(ctx);
      if (session.sandboxId) {
        // Row-level security limits each delete to this visitor's own rows.
        for (const table of SANDBOX_TABLES) {
          await ctx.tx.deleteFrom(table).where('sandbox_id', '=', session.sandboxId).execute();
        }
        await ctx.tx.updateTable('sandbox').set({ write_count: 0, upload_bytes: 0 }).where('id', '=', session.sandboxId).execute();
      }
      return { ok: true as const };
    },
  }),
);
