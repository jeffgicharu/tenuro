import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createYoga } from 'graphql-yoga';
import { sql } from 'kysely';
import type { Db } from './db/client.ts';
import { config } from './config.ts';
import { hashIp, LimitReached, readCookie, resolveSession, sessionCookie, signInAccount, signOut } from './auth/session.ts';
import { newContext, type Context } from './graphql/context.ts';
import { useOperationLimits, usePersisted, useScopedTransaction } from './graphql/plugins.ts';
import { schema } from './graphql/schema.ts';
import { API_CSP, COMMON_HEADERS, newNonce, pageCsp } from './http/security.ts';
import { serveDocument } from './http/documents.ts';

const CLIENT_HEADER = 'x-tenuro-client';

function clientIp(req: IncomingMessage): string {
  // nginx sets X-Real-IP from CF-Connecting-IP after checking the request came from Cloudflare.
  const real = req.headers['x-real-ip'];
  return (Array.isArray(real) ? real[0] : real) ?? req.socket.remoteAddress ?? 'unknown';
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = body === null ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...COMMON_HEADERS, 'content-security-policy': API_CSP, 'cache-control': 'no-store',
    ...(json ? { 'content-type': 'application/json; charset=utf-8' } : {}), ...headers,
  });
  res.end(json);
}

// Rejects cross-site writes: browsers cannot add a custom header to a cross-origin request
// without a CORS preflight, which this server never approves.
const isTrustedWrite = (req: IncomingMessage) => req.headers[CLIENT_HEADER] === 'web' || req.headers[CLIENT_HEADER] === 'smoke';

export function createApp(db: Db) {
  const yoga = createYoga<{ req: IncomingMessage; res: ServerResponse }, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: !config.production,
    landingPage: false,
    maskedErrors: config.production,
    batching: false,
    cors: false,
    plugins: [
      useOperationLimits({ maxTokens: 3_000, maxAliases: 15 }),
      usePersisted(config.persistedQueries, !config.production),
      useScopedTransaction(),
    ],
    context: async ({ req }) => {
      const token = readCookie(req.headers.cookie, config.cookieName);
      const session = await resolveSession(db, token);
      return newContext(db, session, hashIp(clientIp(req))) as Context;
    },
  });

  let indexTemplate: string | null = null;
  const renderIndex = async (res: ServerResponse) => {
    indexTemplate ??= await readFile(`${config.webDist}/index.html`, 'utf8');
    const nonce = newNonce();
    const html = indexTemplate
      .replaceAll('<script', `<script nonce="${nonce}"`)
      .replaceAll('<link rel="stylesheet"', `<link nonce="${nonce}" rel="stylesheet"`)
      .replace('</head>', `<meta name="csp-nonce" content="${nonce}"></head>`);
    res.writeHead(200, {
      ...COMMON_HEADERS, 'content-security-policy': pageCsp(nonce), 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    });
    res.end(html);
  };

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    try {
      if (path === '/graphql') {
        if (req.method !== 'POST' || !isTrustedWrite(req)) return send(res, 400, { error: 'POST JSON with the client header' });
        for (const [k, v] of Object.entries({ ...COMMON_HEADERS, 'content-security-policy': API_CSP, 'cache-control': 'no-store' })) res.setHeader(k, v);
        return yoga(req, res);
      }

      if (path === '/api/health') {
        const started = performance.now();
        const db_ok = await sql`SELECT 1`.execute(db).then(() => 'ok', () => 'down');
        return send(res, db_ok === 'ok' ? 200 : 503, {
          sha: config.revision, slot: config.slot, db: db_ok, dbMs: Math.round(performance.now() - started), uptimeS: Math.round(process.uptime()),
          rssMb: Math.round(process.memoryUsage().rss / 1048576),
        });
      }

      if (path === '/api/session' && req.method === 'POST') {
        if (!isTrustedWrite(req)) return send(res, 400, { error: 'missing client header' });
        const body = (await readJson(req, 1024)) as { accountId?: unknown } | null;
        if (typeof body?.accountId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.accountId)) return send(res, 400, { error: 'accountId required' });
        try {
          const result = await signInAccount(db, { accountId: body.accountId, existingToken: readCookie(req.headers.cookie, config.cookieName), ip: clientIp(req) });
          if (!result) return send(res, 404, { error: 'unknown account' });
          return send(res, 204, null, { 'set-cookie': sessionCookie(result.token) });
        } catch (err) {
          if (err instanceof LimitReached) return send(res, 429, { error: 'limit', limit: err.limit }, { 'retry-after': '3600' });
          throw err;
        }
      }

      if (path === '/api/session' && req.method === 'DELETE') {
        if (!isTrustedWrite(req)) return send(res, 400, { error: 'missing client header' });
        await signOut(db, readCookie(req.headers.cookie, config.cookieName));
        return send(res, 204, null, { 'set-cookie': sessionCookie(null) });
      }

      if (path === '/api/vitals' && req.method === 'POST') {
        const body = (await readJson(req, 2048)) as { name?: unknown; value?: unknown; rating?: unknown; route?: unknown } | null;
        const names = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
        if (body && typeof body.name === 'string' && names.includes(body.name) && typeof body.value === 'number' && Number.isFinite(body.value)) {
          await db.insertInto('web_vital').values({
            name: body.name, value: body.value, rating: String(body.rating ?? '').slice(0, 20),
            route: String(body.route ?? '').replace(/[0-9a-f-]{36}|[A-Za-z0-9+/=]{20,}/g, ':id').slice(0, 80),
          }).execute();
          await trimTable(db, 'web_vital', config.limits.maxWebVitals);
        }
        return send(res, 204, null);
      }

      if (path === '/api/csp-report' && req.method === 'POST') {
        const body = (await readJson(req, 8192)) as { 'csp-report'?: Record<string, unknown> } | null;
        const r = body?.['csp-report'];
        if (r) {
          await db.insertInto('csp_report').values({
            directive: String(r['violated-directive'] ?? r['effective-directive'] ?? '').slice(0, 120),
            blocked: String(r['blocked-uri'] ?? '').slice(0, 300), source: String(r['source-file'] ?? '').slice(0, 300),
          }).execute();
          await trimTable(db, 'csp_report', config.limits.maxCspReports);
        }
        return send(res, 204, null);
      }

      const doc = /^\/api\/documents\/([0-9a-f-]{36})$/.exec(path);
      if (doc && req.method === 'GET') {
        const session = await resolveSession(db, readCookie(req.headers.cookie, config.cookieName));
        if (!session) return send(res, 401, { error: 'sign in first' });
        return serveDocument(db, session, doc[1]!, url.searchParams.get('download') === '1', res);
      }

      if (path.startsWith('/api/')) return send(res, 404, { error: 'not found' });

      // Every other path is a page of the single-page app.
      if (req.method === 'GET' || req.method === 'HEAD') return renderIndex(res);
      return send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
}

// Keeps a telemetry table under its row cap by dropping the oldest rows.
async function trimTable(db: Db, table: 'web_vital' | 'csp_report', max: number) {
  if (Math.random() > 0.05) return;
  await sql`DELETE FROM ${sql.table(table)} WHERE id <= (SELECT max(id) - ${max} FROM ${sql.table(table)})`.execute(db);
}

export function listen(db: Db): Promise<Server> {
  const handler = createApp(db);
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, (req, res) => void handler(req, res));
  return new Promise((resolve) => server.listen(config.port, config.host, () => resolve(server)));
}
