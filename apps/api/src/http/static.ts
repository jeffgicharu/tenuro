import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { COMMON_HEADERS } from './security.ts';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.map': 'application/json',
};

// Serves built files for CI's end-to-end run only (STATIC_DIR is never set on the server, where
// nginx serves them). Paths are normalised and must stay inside the directory.
export async function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<void> {
  const decoded = decodeURIComponent(urlPath);
  const file = normalize(join(root, decoded));
  if (!file.startsWith(normalize(root) + sep) || decoded.includes('\0')) {
    res.writeHead(400).end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      ...COMMON_HEADERS,
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': String(s.size),
      'cache-control': 'public, max-age=3600',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, COMMON_HEADERS).end();
  }
}
