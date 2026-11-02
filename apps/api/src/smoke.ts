import { readFileSync } from 'node:fs';
import { selfcheck } from './selfcheck.ts';

// Journey checks against one slot (http://127.0.0.1:$PORT), run by tenuro-smoke@ before any switch.
// Uses only persisted query ids, exactly as production allows. Exits non-zero on the first failure.
const port = process.env.PORT ?? '4000';
const base = `http://127.0.0.1:${port}`;
const headers = { 'content-type': 'application/json', 'x-tenuro-client': 'smoke' };

const persisted = JSON.parse(readFileSync(new URL('./persisted-queries.json', import.meta.url), 'utf8')) as Record<string, string>;
const idOf = (operation: string) => {
  const hit = Object.entries(persisted).find(([, text]) => new RegExp(`^(query|mutation) ${operation}\\b`).test(text));
  if (!hit) throw new Error(`persisted operation ${operation} not found`);
  return hit[0];
};

let cookie = '';
const checks: string[] = [];
const ok = (name: string, cond: unknown, detail = '') => {
  if (!cond) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
  checks.push(name);
};

async function gql<T>(operation: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${base}/graphql`, { method: 'POST', headers: { ...headers, cookie }, body: JSON.stringify({ id: idOf(operation), variables }) });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`${operation}: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data as T;
}

async function main() {
  if (process.argv.includes('--selfcheck')) for (const line of selfcheck()) checks.push(`selfcheck ${line}`);

  const revision = (() => { try { return readFileSync(new URL('../REVISION', import.meta.url), 'utf8').trim(); } catch { return null; } })();
  const health = (await (await fetch(`${base}/api/health`)).json()) as { sha: string; db: string };
  ok('health reports the release sha', revision === null || health.sha === revision, `${health.sha} vs ${revision}`);
  ok('health reports the database', health.db === 'ok');

  const page = await fetch(`${base}/leases`);
  const html = await page.text();
  ok('page has X-Robots-Tag noindex', /noindex/.test(page.headers.get('x-robots-tag') ?? ''));
  ok('page has meta robots noindex', /<meta name="robots" content="noindex/.test(html));
  const csp = page.headers.get('content-security-policy') ?? '';
  ok('page has a nonce CSP without unsafe-inline', /script-src 'self' 'nonce-/.test(csp) && !csp.includes('unsafe-inline'));
  // The first-paint skeleton's inline style and script must carry the nonce, or the CSP blanks the page.
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? '-';
  ok('inline boot style and script carry the nonce', html.includes(`<style nonce="${nonce}"`) && html.includes(`<script nonce="${nonce}">`) && html.includes('class="boot"'));

  const adhoc = await fetch(`${base}/graphql`, { method: 'POST', headers, body: JSON.stringify({ query: '{ signInAccounts { id } }' }) });
  const adhocJson = (await adhoc.json()) as { errors?: unknown[] };
  ok('ad-hoc queries are refused in production', process.env.NODE_ENV !== 'production' || Boolean(adhocJson.errors?.length));

  const { signInAccounts } = await gql<{ signInAccounts: { id: string; role: string; tenant: { leaseCount: number } }[] }>('SignInPageQuery');
  ok('nine sign-in accounts', signInAccounts.length === 9);
  ok('every company has leases', signInAccounts.every((a) => a.tenant.leaseCount > 0));

  const signIn = async (role: string) => {
    const account = signInAccounts.find((a) => a.role === role)!;
    const res = await fetch(`${base}/api/session`, {
      method: 'POST', headers: { ...headers, cookie },
      body: JSON.stringify({ accountId: Buffer.from(account.id, 'base64').toString().split(':')[1] }),
    });
    ok(`sign-in as ${role}`, res.status === 204, String(res.status));
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  };
  await signIn('MANAGER');

  const root = await gql<{ viewer: { tenant: { languages: string[] } } | null }>('RootQuery');
  ok('signed-in viewer resolves', root.viewer !== null);

  const register = await gql<{ viewer: Record<string, unknown> }>('RegisterPageQuery');
  const leases = JSON.stringify(register);
  ok('register returns leases', /"totalCount":\d{3,}/.test(leases) || /"edges":\[\{/.test(leases));
  const firstId = /"id":"(TGVhc2U6[^"]+)"/.exec(leases)?.[1];

  ok('register lists a lease to open', firstId !== undefined);
  if (firstId) {
    // The page's `@alias(as: "lease")` exists only in the Relay client; the server answers with the
    // Lease fields directly on `node`.
    const lease = await gql<{ node: { reference?: string } | null }>('LeasePageQuery', { id: firstId });
    ok('lease page loads', Boolean(lease.node?.reference));
  }

  console.log(`smoke: ${checks.length} checks passed`);
  for (const c of checks) console.log(`  ok ${c}`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
