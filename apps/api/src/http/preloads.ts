import { readFileSync } from 'node:fs';

// The page's HTML names the app's own code, but a route's code (and the data query it starts) was only
// asked for once that code had arrived and run: a second round trip before anything route-specific
// could load. The server knows the path when it sends the page, so it names the route's chunks too.

interface ManifestEntry { file: string; imports?: string[]; isEntry?: boolean }
type Manifest = Record<string, ManifestEntry>;

const ROUTES: [RegExp, string][] = [
  [/^\/$/, 'src/features/dashboard/DashboardPage.tsx'],
  [/^\/sign-in$/, 'src/features/signin/SignInPage.tsx'],
  [/^\/leases$/, 'src/features/register/RegisterPage.tsx'],
  [/^\/leases\/(new|[^/]+\/amend)$/, 'src/features/lease-form/LeaseFormPage.tsx'],
  [/^\/leases\/[^/]+$/, 'src/features/lease/LeasePage.tsx'],
  [/^\/key-dates$/, 'src/features/keydates/KeyDatesPage.tsx'],
  [/^\/accounting$/, 'src/features/accounting/AccountingPage.tsx'],
  [/^\/reports$/, 'src/features/reports/ReportsPage.tsx'],
];

export function loadManifest(webDist: string): Manifest | null {
  for (const path of ['manifest.json', '.vite/manifest.json']) {
    try {
      return JSON.parse(readFileSync(new URL(path, `file://${webDist.endsWith('/') ? webDist : `${webDist}/`}`), 'utf8')) as Manifest;
    } catch {
      // Not in this location (or a development build without one).
    }
  }
  return null;
}

// The modulepreload links for a path's route: its chunk and the chunks it imports, less those the
// page already names. Computed once per route.
export function routePreloader(manifest: Manifest | null, template: string): (pathname: string) => string {
  const cache = new Map<string, string>();
  return (pathname) => {
    if (!manifest) return '';
    const route = ROUTES.find(([re]) => re.test(pathname))?.[1];
    if (!route || !manifest[route]) return '';
    const known = cache.get(route);
    if (known !== undefined) return known;
    const files = new Set<string>();
    const visit = (key: string) => {
      const e = manifest[key];
      if (!e || files.has(e.file)) return;
      files.add(e.file);
      e.imports?.forEach(visit);
    };
    visit(route);
    const links = [...files]
      .filter((f) => f.endsWith('.js') && !template.includes(`/${f}"`))
      .map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`)
      .join('');
    cache.set(route, links);
    return links;
  };
}
