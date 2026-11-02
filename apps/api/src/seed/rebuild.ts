import { sql } from 'kysely';
import type { Db } from '../db/client.ts';
import type { Database } from '../db/types.ts';
import { generateBatches, generationStats, type SeedData, type SeedOptions } from './generate.ts';

const DELETE_ORDER: (keyof Database)[] = [
  'sandbox', 'session', 'notification', 'activity', 'document', 'task', 'key_date', 'lease_draft', 'lease_modification',
  'saved_view', 'lease_accounting', 'deposit', 'lease_option', 'escalation', 'rent_step', 'lease_party', 'lease', 'property', 'app_user', 'tenant', 'fx_rate',
];

const INSERT_ORDER: (keyof SeedData)[] = [
  'tenant', 'app_user', 'fx_rate', 'property', 'lease', 'lease_party', 'rent_step', 'escalation', 'lease_option', 'deposit',
  'key_date', 'task', 'document', 'activity', 'saved_view', 'notification', 'lease_accounting',
];

export interface RebuildReport {
  rows: Record<string, number>;
  generateMs: number;
  /** Part of generateMs: measuring the live leases (IFRS 16 / ASC 842). */
  accountingMs: number;
  measuredLeases: number;
  writeMs: number;
}

// Replaces all base data in one transaction, so readers see the old portfolio until the commit and
// never a half-built one. Visitor sandboxes and sessions go with it. Data is built and
// written in batches of about a hundred leases, in statements of about 2,000 parameters, to keep
// peak memory low on the shared server (the native buffers behind each statement count, not just the heap). Runs as the owner role,
// which row-level security does not apply to.
export async function rebuild(db: Db, opts: SeedOptions, log = console.log): Promise<RebuildReport> {
  const rows: Record<string, number> = {};
  let generateMs = 0;
  const t0 = performance.now();
  await db.transaction().execute(async (tx) => {
    await sql`SET LOCAL statement_timeout = 0`.execute(tx);
    for (const table of DELETE_ORDER) await tx.deleteFrom(table).execute();
    const batches = generateBatches(opts, 120);
    let batchCount = 0;
    for (;;) {
      const g0 = performance.now();
      const next = batches.next();
      generateMs += performance.now() - g0;
      if (next.done) break;
      const data = next.value;
      for (const table of INSERT_ORDER) {
        const list = data[table] as Record<string, unknown>[];
        rows[table] = (rows[table] ?? 0) + list.length;
        if (!list.length) continue;
        // Small statements keep the SQL text and parameter arrays small as well.
        const columns = Object.keys(list[0]!).length;
        const chunk = Math.max(1, Math.floor(2_000 / columns));
        for (let j = 0; j < list.length; j += chunk) {
          await tx.insertInto(table).values(list.slice(j, j + chunk) as never).execute();
        }
        list.length = 0;
      }
      batchCount += 1;
      if (process.env.SEED_DEBUG && batchCount % 5 === 0) {
        const m = process.memoryUsage();
        log(`  batch ${batchCount}: heap ${Math.round(m.heapUsed / 1048576)}/${Math.round(m.heapTotal / 1048576)} MB, external ${Math.round(m.external / 1048576)} MB (buffers ${Math.round(m.arrayBuffers / 1048576)}), rss ${Math.round(m.rss / 1048576)} MB`);
      }
    }
    log(`  ${batchCount} batches written`);
    // The manifest a restore is checked against (ops.verify_integrity).
    await sql`SELECT ops.record_manifest()`.execute(tx);
  });
  await sql`ANALYZE`.execute(db);
  return { rows, generateMs, accountingMs: generationStats.accountingMs, measuredLeases: generationStats.measuredLeases, writeMs: performance.now() - t0 - generateMs };
}

export async function seedIfEmpty(db: Db, today: string, log = console.log): Promise<boolean> {
  const row = await db.selectFrom('tenant').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
  if (row.n > 0) return false;
  log('no data yet; building it');
  await rebuild(db, { today }, log);
  return true;
}
