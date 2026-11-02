import { createDb } from './db/client.ts';
import { loadMigrations, migrate } from './db/migrate.ts';
import { todayIso } from './domain/dates.ts';
import { seedIfEmpty } from './seed/rebuild.ts';

// Release entry (tenuro-migrate@.service). Migration files ship next to the bundle in migrations/.
// On a fresh database it also builds the seed portfolio, so the first release has data to serve.
const applied = await migrate(process.env.OWNER_DATABASE_URL, await loadMigrations(new URL('./migrations/', import.meta.url)));
console.log(applied.length ? `${applied.length} migration(s) applied` : 'schema is up to date');
const db = createDb(process.env.OWNER_DATABASE_URL, 2);
try {
  await seedIfEmpty(db, todayIso());
} finally {
  await db.destroy();
}
