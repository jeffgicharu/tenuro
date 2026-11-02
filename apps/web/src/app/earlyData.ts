import { QUERY_IDS } from 'virtual:query-ids';
import { isPhone, registerVariables } from '../features/register/registerVariables.ts';

// The page's data used to be asked for only once the app's code had arrived and started (about
// 2.5 s after the page on a slow phone). This tiny script runs as soon as the page parses and asks
// for the shell's and the route's queries straight away; the Relay network layer then takes those
// answers instead of asking again. Each answer is used at most once, and only for a request with
// exactly the same query and variables, so nothing can be shown that the app did not ask for.

interface Early { [key: string]: Promise<{ ok: boolean; status: number; json: unknown }> }
declare global { interface Window { __tenuroEarly?: Early } }

// Variables compared as data: keys sorted, and absent and null treated alike.
export function requestKey(id: string, variables: Record<string, unknown>): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined && (v as Record<string, unknown>)[k] !== null)
        .map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return `${id}:${JSON.stringify(norm(variables))}`;
}

function routeQueries(path: string, search: URLSearchParams): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [[QUERY_IDS.RootQuery, {}]];
  if (path === '/') out.push([QUERY_IDS.DashboardPageQuery, {}]);
  else if (path === '/leases') out.push([QUERY_IDS.RegisterPageQuery, registerVariables(search, isPhone())]);
  else if (path === '/accounting') out.push([QUERY_IDS.AccountingPageQuery, {}]);
  else {
    const lease = /^\/leases\/([^/]+)$/.exec(path);
    if (lease && lease[1] !== 'new') out.push([QUERY_IDS.LeasePageQuery, { id: decodeURIComponent(lease[1]!) }]);
  }
  return out;
}

// Runs once per page, from whichever comes first: the early script, or (when the app's code was
// already cached and starts sooner) the app's first request.
export function startEarly(): void {
  if (window.__tenuroEarly) return;
  const early: Early = (window.__tenuroEarly = {});
  for (const [id, variables] of routeQueries(location.pathname, new URLSearchParams(location.search))) {
    early[requestKey(id, variables)] = fetch('/graphql', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-tenuro-client': 'web' },
      body: JSON.stringify({ id, variables }),
    }).then(async (res) => ({ ok: res.ok, status: res.status, json: res.ok ? await res.json() : null }));
    // A failed early request is simply not used; the app asks again itself.
    early[requestKey(id, variables)]!.catch(() => undefined);
  }
}

export function takeEarly(id: string, variables: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  if (!window.__tenuroEarly) startEarly();
  const early = window.__tenuroEarly;
  if (!early) return null;
  const key = requestKey(id, variables);
  const found = early[key];
  if (found) delete early[key];
  return found ?? null;
}
