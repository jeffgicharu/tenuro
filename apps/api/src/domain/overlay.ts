import { randomUUID } from 'node:crypto';
import type { Context } from '../graphql/context.ts';

type Root = 'task' | 'key_date' | 'saved_view';

// Returns the id of the row this caller may edit. A visitor editing a shared base row gets a private
// copy (origin_id = the base row), created on first edit; later edits update that copy in place.
export async function editableRowId(ctx: Context, table: Root, row: { id: string; sandbox_id: string | null }): Promise<{ id: string; copied: boolean }> {
  const sandboxId = ctx.session?.sandboxId ?? null;
  if (sandboxId === null || row.sandbox_id === sandboxId) return { id: row.id, copied: false };
  const source = await ctx.tx.selectFrom(table).selectAll().where('id', '=', row.id).executeTakeFirstOrThrow();
  const id = randomUUID();
  await ctx.tx.insertInto(table).values({ ...(source as Record<string, unknown>), id, sandbox_id: sandboxId, origin_id: row.id } as never).execute();
  return { id, copied: true };
}
