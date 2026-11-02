// Moves the inline <script> blocks Storybook writes into its HTML out to files of their own, so the
// built library runs under a CSP with script-src 'self' (no 'unsafe-inline'), as /storybook is served.
// Usage: node scripts/externalize-inline.mjs <storybook-static>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: externalize-inline.mjs <dir>');
let moved = 0;
for (const page of ['index.html', 'iframe.html']) {
  const file = join(dir, page);
  const html = readFileSync(file, 'utf8');
  const out = html.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g, (_all, attrs, code) => {
    if (!code.trim()) return `<script${attrs}></script>`;
    const name = `sb-inline-${createHash('sha256').update(code).digest('hex').slice(0, 12)}.js`;
    writeFileSync(join(dir, name), code);
    moved += 1;
    return `<script${attrs} src="./${name}"></script>`;
  });
  writeFileSync(file, out);
}
console.log(`externalized ${moved} inline scripts`);
