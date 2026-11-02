import { sql } from 'kysely';
import type { Db } from '../db/client.ts';
import type { Database } from '../db/types.ts';
import { generate, type SeedData, type SeedOptions } from './generate.ts';

const DELETE_ORDER: (keyof Database)[] = [
  'sandbox', 'session', 'notification', 'activity', 'document', 'task', 'key_date', 'lease_draft', 'lease_modification',
  'saved_view', 'deposit', 'lease_option', 'escalation', 'rent_step', 'lease_party', 'lease', 'property', 'app_user', 'tenant', 'fx_rate',
];

const INSERT_ORDER: (keyof SeedData)[] = [
  'tenant', 'app_user', 'fx_rate', 'property', 'lease', 'lease_party', 'rent_step', 'escalation', 'lease_option', 'deposit',
  'key_date', 'task', 'document', 'activity', 'saved_view', 'notification',
];

export interface RebuildReport {
  rows: Record<string, number>;
  generateMs: number;
  writeMs: number;
}

// Replaces all base data in one transaction, so readers see the old portfolio until the commit and
// never a half-built one. Visitor sandboxes and sessions go with it. Runs as the owner role, which
// row-level security does not apply to.
export async function rebuild(db: Db, opts: SeedOptions, log = console.log): Promise<RebuildReport> {
  const t0 = performance.now();
  const data = generate(opts);
  const generateMs = performance.now() - t0;
  const rows: Record<string, number> = {};
  const t1 = performance.now();
  await db.transaction().execute(async (tx) => {
    await sql`SET LOCAL statement_timeout = 0`.execute(tx);
    for (const table of DELETE_ORDER) await tx.deleteFrom(table).execute();
    for (const table of INSERT_ORDER) {
      const list = data[table] as Record<string, unknown>[];
      rows[table] = list.length;
      if (!list.length) continue;
      const columns = Object.keys(list[0]!).length;
      const chunk = Math.max(1, Math.floor(60_000 / columns));
      for (let i = 0; i < list.length; i += chunk) {
        await tx.insertInto(table).values(list.slice(i, i + chunk) as never).execute();
      }
      log(`  ${table.padEnd(20)} ${String(list.length).padStart(7)}`);
    }
  });
  await sql`ANALYZE`.execute(db);
  return { rows, generateMs, writeMs: performance.now() - t1 };
}
