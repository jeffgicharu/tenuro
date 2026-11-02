// Enforces the bundle budget from the Vite manifest: the JavaScript and CSS needed for the first
// page, and what each lazily loaded route adds on top. Sizes are gzip, the way they travel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// First measured at 312.6 KB; 284 KB after the shell's menus, dialogs and toasts moved out of the
// first page (November 2026). The budget locks that in; tighten it as the first page gets lighter.
const BUDGET_INITIAL_KB = 295;
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

// Each lazily loaded chunk is measured by what it adds to what is already loaded when it loads: the
// first page, plus the chunks that load it when those are lazy (the register's desktop table loads
// with the register page, so the code they share is counted once, with the page).
const routes = new Set(Object.values(manifest).flatMap((e) => e.dynamicImports ?? []));
for (const r of routes) {
  if (!manifest[r] || manifest[r].file.includes('catalogues')) continue;
  const loaded = new Set(initial);
  // A chunk that a lazy chunk imports always arrives with it (even when the first page also starts it
  // early, as the register's loader does for its table), so the lazy importers count as loaded.
  const lazyImporters = Object.keys(manifest).filter((k) => manifest[k].dynamicImports?.includes(r) && !initial.has(k));
  for (const imp of lazyImporters) for (const k of closure(imp)) loaded.add(k);
  const extra = [...closure(r)].filter((k) => !loaded.has(k));
  const via = lazyImporters.length ? ` (on top of ${lazyImporters.map((k) => k.replace(/^src\//, '')).join(', ')})` : '';
  rows.push([r.replace(/^src\//, '') + via, sizeOf(extra) / 1024, BUDGET_ROUTE_KB]);
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
