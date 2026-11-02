import { sql } from 'kysely';
import { createDb } from './db/client.ts';
import { todayIso } from './domain/dates.ts';
import { rebuild } from './seed/rebuild.ts';

// The nightly rebuild (tenuro-reset.service): new seed data anchored to today, every sandbox
// cleared. Reports run time, WAL written and peak memory so the cost on the shared box is visible.
const db = createDb(process.env.OWNER_DATABASE_URL, 2);
const started = performance.now();
const walBefore = await sql<{ lsn: string }>`SELECT pg_current_wal_lsn()::text AS lsn`.execute(db);
const report = await rebuild(db, { today: process.env.SEED_TODAY ?? todayIso() }, () => undefined);
const wal = await sql<{ bytes: string }>`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), ${walBefore.rows[0]!.lsn}::pg_lsn)::text AS bytes`.execute(db);
await db.destroy();
const total = Object.values(report.rows).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  event: 'rebuild', rows: total, generateMs: Math.round(report.generateMs), accountingMs: Math.round(report.accountingMs), measuredLeases: report.measuredLeases, writeMs: Math.round(report.writeMs),
  totalMs: Math.round(performance.now() - started), walMb: Math.round(Number(wal.rows[0]!.bytes) / 1048576),
  peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
}));
