// Enforces the bundle budget from the Vite manifest: the JavaScript and CSS needed for the first
// page, and what each lazily loaded route adds on top. Sizes are gzip, the way they travel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// First measured at 312.6 KB: MUI with emotion and RTL 103, React with the router 95, Relay 66,
// our code 34, react-intl 14. The budget locks that in; tighten it as the first page gets lighter.
const BUDGET_INITIAL_KB = 320;
const BUDGET_ROUTE_KB = 180;

const dist = process.argv[2] ?? 'apps/web/dist';
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;

function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dep of manifest[key]?.imports ?? []) closure(dep, seen);
  return seen;
}

const sizeOf = (keys) => {
  let bytes = 0;
  for (const k of keys) {
    const entry = manifest[k];
    bytes += gz(entry.file);
    for (const css of entry.css ?? []) bytes += gz(css);
  }
  return bytes;
};

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const initial = closure(entryKey);
const initialKb = sizeOf(initial) / 1024;
console.log('first page is made of:');
for (const k of [...initial].sort((a, b) => sizeOf([b]) - sizeOf([a]))) {
  console.log(`  ${(sizeOf([k]) / 1024).toFixed(1).padStart(7)} KB  ${manifest[k].file}`);
}
const rows = [['first page (entry and its static imports)', initialKb, BUDGET_INITIAL_KB]];

const routes = new Set(Object.values(manifest).flatMap((e) => e.dynamicImports ?? []));
for (const r of routes) {
  if (!manifest[r] || manifest[r].file.includes('catalogues')) continue;
  const extra = [...closure(r)].filter((k) => !initial.has(k));
  rows.push([r.replace(/^src\//, ''), sizeOf(extra) / 1024, BUDGET_ROUTE_KB]);
}

let failed = false;
const summary = ['| chunk | gzip KB | budget KB |', '|---|---:|---:|'];
for (const [name, kb, budget] of rows) {
  const over = kb > budget;
  failed ||= over;
  summary.push(`| ${name} | ${kb.toFixed(1)} | ${budget}${over ? ' (over)' : ''} |`);
  console.log(`${over ? 'OVER' : 'ok  '} ${kb.toFixed(1).padStart(7)} KB  ${name}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Bundle size\n\n${summary.join('\n')}\n`);
}
if (failed) {
  console.error('bundle budget exceeded');
  process.exit(1);
}
