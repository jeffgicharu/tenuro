import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { hashToken } from '../src/auth/session.ts';
import { createDb, type Db } from '../src/db/client.ts';
import { loadMigrations, migrate } from '../src/db/migrate.ts';
import { rebuild } from '../src/seed/rebuild.ts';
import { createApp } from '../src/server.ts';

export const TODAY = '2026-06-15';

const ownerUrl = () => {
  const v = process.env.TEST_OWNER_DATABASE_URL;
  if (!v) throw new Error('TEST_OWNER_DATABASE_URL is not set');
  return v;
};
const appUrl = () => {
  const v = process.env.TEST_DATABASE_URL;
  if (!v) throw new Error('TEST_DATABASE_URL is not set');
  return v;
};

// Fresh schema and a small deterministic portfolio, built once per test run.
export async function prepareDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl() });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  await migrate(ownerUrl(), await loadMigrations(new URL('../src/db/migrations/', import.meta.url)), () => undefined);
  const owner = createDb(ownerUrl(), 2);
  await rebuild(owner, { today: TODAY, scale: 0.03 }, () => undefined);
  await owner.destroy();
}

export interface TestApp {
  url: string;
  db: Db;
  owner: Db;
  close(): Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const db = createDb(appUrl(), 4);
  const owner = createDb(ownerUrl(), 2);
  const handler = createApp(db);
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`, db, owner,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.destroy();
      await owner.destroy();
    },
  };
}

// A browser stand-in: keeps its own cookie and client IP.
let ipCounter = 0;

export class Visitor {
  private cookie = '';
  private readonly app: TestApp;
  readonly ip: string;

  constructor(app: TestApp, ip?: string) {
    this.app = app;
    ipCounter += 1;
    this.ip = ip ?? `10.${Math.floor(ipCounter / 250)}.${ipCounter % 250}.7`;
  }

  async sandboxId(): Promise<string> {
    const token = decodeURIComponent(this.cookie.split('=')[1] ?? '');
    const row = await this.app.owner.selectFrom('session').select('sandbox_id').where('token_hash', '=', hashToken(token)).executeTakeFirstOrThrow();
    return row.sandbox_id!;
  }

  async signIn(tenantSlug: string, role: 'ADMIN' | 'MANAGER' | 'VIEWER'): Promise<number> {
    const accounts = await this.gql<{ signInAccounts: { id: string; role: string; tenant: { slug: string } }[] }>(
      '{ signInAccounts { id role tenant { slug } } }');
    const account = accounts.data!.signInAccounts.find((a) => a.role === role && a.tenant.slug === tenantSlug)!;
    const localId = Buffer.from(account.id, 'base64').toString().split(':')[1];
    const res = await fetch(`${this.app.url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenuro-client': 'web', 'x-real-ip': this.ip, cookie: this.cookie },
      body: JSON.stringify({ accountId: localId }),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    return res.status;
  }

  async gql<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<{ data?: T; errors?: { message: string; extensions?: Record<string, unknown> }[] }> {
    const res = await fetch(`${this.app.url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenuro-client': 'web', 'x-real-ip': this.ip, cookie: this.cookie },
      body: JSON.stringify({ query, variables }),
    });
    return res.json() as Promise<{ data?: T; errors?: { message: string }[] }>;
  }
}

export const localId = (globalId: string) => Buffer.from(globalId, 'base64').toString().split(':')[1]!;
