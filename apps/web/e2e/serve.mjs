// A stand-in for nginx in CI: serves /assets and /static from the release's public folder, with
// nginx's immutable caching and nosniff, and proxies everything else to the app on port 9000.
// Usage: node e2e/serve.mjs <release/public> [port]
import { createReadStream, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2];
const port = Number(process.argv[3] ?? 8080);
if (!root) throw new Error('usage: serve.mjs <public dir> [port]');

const TYPES = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.json': 'application/json', '.map': 'application/json',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path.startsWith('/assets/') || path.startsWith('/static/')) {
    const file = normalize(join(root, path));
    if (!file.startsWith(normalize(root))) return void res.writeHead(400).end();
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error('not a file');
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': st.size,
        'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
      });
      return void createReadStream(file).pipe(res);
    } catch {
      return void res.writeHead(404).end();
    }
  }
  const upstream = request({ host: '127.0.0.1', port: 9000, path: req.url, method: req.method, headers: { ...req.headers, 'x-real-ip': '127.0.0.1' } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://localhost:${port}`));
