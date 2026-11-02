import { AsyncLocalStorage } from 'node:async_hooks';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './types.ts';

// Keep dates as calendar strings and big integers as strings; never let JS reinterpret them.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

// Statements run on behalf of a request report their time here (see graphql/timing.ts).
export const statementTimings = new AsyncLocalStorage<(sqlText: string, ms: number) => void>();

export function createDb(connectionString: string | undefined, max = 6): Db {
  const pool = new pg.Pool({
    ...(connectionString ? { connectionString } : {}),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 8_000,
    application_name: `tenuro-${process.env.SLOT ?? 'dev'}`,
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    log: (event) => statementTimings.getStore()?.(event.query.sql, event.queryDurationMillis),
  });
}

export interface Scope {
  tenantId: string | null;
  sandboxId: string | null;
}

// Every request runs in one transaction with its tenant and sandbox set locally, so row-level
// security applies to every statement and nothing leaks into the next use of the pooled connection.
export async function withScope<T>(db: Db, scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('tenuro.tenant', ${scope.tenantId ?? ''}, true),
                     set_config('tenuro.sandbox', ${scope.sandboxId ?? ''}, true)`.execute(tx);
    return fn(tx);
  });
}
