import type { ServerResponse } from 'node:http';
import type { SessionInfo } from '../auth/session.ts';
import { withScope, type Db } from '../db/client.ts';
import { API_CSP, COMMON_HEADERS } from './security.ts';

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);

// Streams a document the caller may see. Row-level security decides visibility; uploads are served
// with a sandboxing CSP so a hostile file cannot run script on our origin.
export async function serveDocument(db: Db, session: SessionInfo, id: string, download: boolean, res: ServerResponse) {
  const doc = await withScope(db, { tenantId: session.tenantId, sandboxId: session.sandboxId }, (tx) =>
    tx.selectFrom('document').select(['id', 'filename', 'mime_type', 'template', 'content', 'lease_id']).where('id', '=', id).executeTakeFirst());
  if (!doc) {
    res.writeHead(404, { ...COMMON_HEADERS, 'content-security-policy': API_CSP }).end();
    return;
  }
  if (doc.template?.startsWith('photo:')) {
    res.writeHead(302, { location: doc.template.slice('photo:'.length), 'cache-control': 'private, max-age=300' }).end();
    return;
  }
  if (!doc.content) {
    // Generated documents are rendered from the lease data by the document service.
    res.writeHead(404, { ...COMMON_HEADERS, 'content-security-policy': API_CSP }).end();
    return;
  }
  res.writeHead(200, {
    ...COMMON_HEADERS,
    'content-type': doc.mime_type,
    'content-length': String(doc.content.length),
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName(doc.filename)}"`,
    'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    'cache-control': 'private, max-age=300',
    'x-frame-options': 'SAMEORIGIN',
  });
  res.end(doc.content);
}
