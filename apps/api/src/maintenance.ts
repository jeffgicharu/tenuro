import { sql } from 'kysely';
import type { Db } from './db/client.ts';
import { config } from './config.ts';

// Clears what visitors leave behind. Deleting a sandbox cascades to all of its overlay rows.
export async function sweep(db: Db): Promise<{ sessions: number; sandboxes: number }> {
  const sessions = await db.deleteFrom('session').where('expires_at', '<', sql<Date>`now() - interval '1 hour'`).executeTakeFirst();
  const sandboxes = await db.deleteFrom('sandbox')
    .where('last_active_at', '<', sql<Date>`now() - make_interval(hours => ${config.limits.sandboxIdleHours})`)
    .where(({ not, exists, selectFrom }) => not(exists(selectFrom('session').select('token_hash')
      .whereRef('session.sandbox_id', '=', 'sandbox.id').where('session.last_seen_at', '>', sql<Date>`now() - make_interval(hours => ${config.limits.sandboxIdleHours})`))))
    .executeTakeFirst();
  return { sessions: Number(sessions.numDeletedRows), sandboxes: Number(sandboxes.numDeletedRows) };
}

export function startSweeper(db: Db, everyMs = 10 * 60_000): () => void {
  const run = () => sweep(db).catch((err: unknown) => console.error('sweep failed', err));
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
