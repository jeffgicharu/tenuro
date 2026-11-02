import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

export interface Migration {
  name: string;
  sql: string;
}

export async function loadMigrations(dir: URL): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), 'utf8') })));
}

const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

// Applies pending migrations in order, each in its own transaction, under an advisory lock so two
// deploy slots can never migrate at once. Applied files are checksummed; an edited one is refused.
export async function migrate(connectionString: string | undefined, migrations: Migration[], log = console.log): Promise<string[]> {
  // Without a URL, pg reads the standard PG* variables (the server's env files use those).
  const client = new pg.Client(connectionString ? { connectionString } : {});
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(72_019_001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migration');
    const done = new Map(rows.map((r) => [r.name, r.checksum]));
    for (const m of migrations) {
      const prior = done.get(m.name);
      if (prior !== undefined) {
        if (prior !== checksum(m.sql)) throw new Error(`Migration ${m.name} was changed after it was applied`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)', [m.name, checksum(m.sql)]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
      }
      applied.push(m.name);
      log(`applied ${m.name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(72_019_001)').catch(() => undefined);
    await client.end();
  }
  return applied;
}
