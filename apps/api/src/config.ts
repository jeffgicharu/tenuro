import { readFileSync } from 'node:fs';

const env = process.env;

function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const production = env.NODE_ENV === 'production';

// In a release the server is one bundle at server/index.mjs, with the web template beside it and
// the commit sha in ../REVISION. These paths resolve relative to that bundle.
function releaseRevision(): string {
  try {
    return readFileSync(new URL('../REVISION', import.meta.url), 'utf8').trim();
  } catch {
    return 'dev';
  }
}

export const config = {
  production,
  port: Number(env.PORT ?? 4000),
  host: '127.0.0.1',
  slot: env.SLOT ?? 'dev',
  revision: env.REVISION ?? releaseRevision(),
  databaseUrl: env.DATABASE_URL,
  // Read on first use, not at load: tools that share these modules but hold no secrets (the smoke
  // check, the self-check) must be able to import them. The server checks it at start-up.
  get sessionSecret(): string {
    return production ? required('SESSION_SECRET') : (env.SESSION_SECRET ?? 'dev-only-session-secret');
  },
  cookieName: production ? '__Host-tenuro_session' : 'tenuro_session',
  // Remembers a browser's sandbox across sign-out and sign-in, so its changes come back and it is not
  // counted as a new visitor. Signed, and only ever names a sandbox that still exists.
  sandboxCookieName: production ? '__Host-tenuro_sandbox' : 'tenuro_sandbox',
  sessionDays: 7,
  // Paths inside a release; overridable for local development and tests.
  webDist: env.WEB_DIST ?? new URL('./web/', import.meta.url).pathname,
  persistedQueries: env.PERSISTED_QUERIES ?? new URL('./persisted-queries.json', import.meta.url).pathname,
  // Only CI's end-to-end run sets this; on the server nginx serves /assets and /static.
  staticDir: env.STATIC_DIR ?? null,
  limits: {
    // Per-visitor sandbox quotas.
    sandboxWrites: 300,
    sandboxUploads: 10,
    uploadMaxBytes: 10 * 1024 * 1024,
    sandboxIdleHours: 24,
    // Global caps, so dropping the cookie cannot exhaust the server.
    // Generous enough for a whole office exploring every account on one address; a browser that
    // returns (or switches account) reuses its sandbox and is not counted again.
    newSandboxesPerIpPerDay: 60,
    newSessionsPerIpPerHour: 120,
    totalUploadBytes: 500 * 1024 * 1024,
    maxSandboxes: 2_000,
    maxSessions: 2_000,
    maxOverlayRows: 200_000,
    maxWebVitals: 100_000,
    maxCspReports: 20_000,
  },
} as const;

export type Config = typeof config;
