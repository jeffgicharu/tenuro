import { config } from './config.ts';
import { createDb } from './db/client.ts';
import { startSweeper } from './maintenance.ts';
import { selfcheck } from './selfcheck.ts';
import { listen } from './server.ts';

if (process.argv.includes('--selfcheck')) {
  for (const line of selfcheck()) console.log(`ok ${line}`);
  process.exit(0);
}

// Fail at start-up, not on the first sign-in, if the server is missing its secret.
void config.sessionSecret;

const db = createDb(config.databaseUrl, 6);
const server = await listen(db);
startSweeper(db);
console.log(`tenuro api ${config.revision} (${config.slot}) on http://${config.host}:${config.port}`);

let closing = false;
const shutdown = (signal: string) => {
  if (closing) return;
  closing = true;
  console.log(`${signal}: draining`);
  server.close(() => void db.destroy().then(() => process.exit(0)));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 15_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
