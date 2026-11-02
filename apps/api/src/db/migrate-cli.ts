import { loadMigrations, migrate } from './migrate.ts';

const applied = await migrate(process.env.OWNER_DATABASE_URL, await loadMigrations(new URL('./migrations/', import.meta.url)));
console.log(applied.length ? `${applied.length} migration(s) applied` : 'schema is up to date');
