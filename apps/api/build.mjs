// Bundles the server into self-contained ESM files for a release (see deploy/ci/build-release.sh):
// dist/index.mjs, migrate.mjs, smoke.mjs, rebuild.mjs, plus migrations/, the persisted-query map
// and ops/smoke-query.json. No node_modules ship to the server.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const here = (p) => new URL(p, import.meta.url).pathname;
const dist = here('./dist/');
await rm(dist, { recursive: true, force: true });

await build({
  entryPoints: {
    index: here('./src/main.ts'),
    migrate: here('./src/migrate-entry.ts'),
    smoke: here('./src/smoke.ts'),
    rebuild: here('./src/rebuild-cli.ts'),
  },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  splitting: false,
  sourcemap: 'linked',
  legalComments: 'linked',
  // pg only loads its native binding when asked to; the server must never need a native addon.
  external: ['pg-native'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});

await cp(here('./src/db/migrations/'), `${dist}migrations/`, { recursive: true });

const mapPath = here('../web/persisted-queries.json');
const map = JSON.parse(await readFile(mapPath, 'utf8'));
await writeFile(`${dist}persisted-queries.json`, JSON.stringify(map));
const rootId = Object.entries(map).find(([, text]) => /^query RootQuery\b/.test(text))?.[0];
if (!rootId) throw new Error('RootQuery is missing from the persisted queries; build the web app first');
await mkdir(`${dist}ops`, { recursive: true });
await writeFile(`${dist}ops/smoke-query.json`, JSON.stringify({ id: rootId, variables: {} }));
console.log(`persisted queries: ${Object.keys(map).length}`);
