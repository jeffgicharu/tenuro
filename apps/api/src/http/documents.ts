import type { ServerResponse } from 'node:http';
import type { SessionInfo } from '../auth/session.ts';
import { withScope, type Db } from '../db/client.ts';
import { API_CSP, COMMON_HEADERS } from './security.ts';
import { renderAgreement, renderMemo, renderPlan } from './rendered.ts';
import { viewIdIn } from '../db/viewid.ts';

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
  if (!doc.content && (doc.template === 'lease-agreement' || doc.template === 'floor-plan' || doc.template === 'rent-review-memo') && doc.lease_id) {
    const rendered = await withScope(db, { tenantId: session.tenantId, sandboxId: session.sandboxId }, async (tx) => {
      const lease = await tx.selectFrom('v_lease').selectAll().where(viewIdIn([doc.lease_id!])).where('lease_id', '=', doc.lease_id!).executeTakeFirst();
      if (!lease) return null;
      const tenant = await tx.selectFrom('tenant').select(['languages']).where('id', '=', session.tenantId).executeTakeFirst();
      const lang = tenant?.languages?.[0] === 'ar' ? 'ar' as const : 'en' as const;
      if (doc.template === 'floor-plan') return { body: renderPlan(lease, lang), type: 'image/svg+xml; charset=utf-8', ext: 'svg' };
      if (doc.template === 'rent-review-memo') {
        const steps = await tx.selectFrom('rent_step').select(['starts_on', 'rent_per_period']).where('lease_row_id', '=', lease.id).orderBy('starts_on').execute();
        const last = steps.at(-1);
        if (!last) return null;
        const previous = steps.length > 1 ? steps[steps.length - 2]!.rent_per_period : lease.rent_per_period;
        return { body: renderMemo(lease, last, String(previous), lang), type: 'text/html; charset=utf-8', ext: 'html' };
      }
      const [parties, options, deposits, escalations] = await Promise.all([
        tx.selectFrom('lease_party').select(['role', 'name', 'contact_name', 'address']).where('lease_row_id', '=', lease.id).orderBy('position').execute(),
        tx.selectFrom('lease_option').select(['kind', 'exercise_on', 'notice_by', 'term_months', 'terms']).where('lease_row_id', '=', lease.id).orderBy('exercise_on').execute(),
        tx.selectFrom('deposit').select(['kind', 'amount', 'held_by']).where('lease_row_id', '=', lease.id).execute(),
        tx.selectFrom('escalation').select(['kind', 'rate', 'every_months', 'index_name']).where('lease_row_id', '=', lease.id).execute(),
      ]);
      return { body: renderAgreement({ ...lease, parties, options, deposits, escalations } as never, lang), type: 'text/html; charset=utf-8', ext: 'html' };
    });
    if (!rendered) {
      res.writeHead(404, { ...COMMON_HEADERS, 'content-security-policy': API_CSP }).end();
      return;
    }
    const body = Buffer.from(rendered.body, 'utf8');
    res.writeHead(200, {
      ...COMMON_HEADERS,
      'content-type': rendered.type,
      'content-length': String(body.length),
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName(doc.filename.replace(/\.[a-z0-9]+$/i, ''))}.${rendered.ext}"`,
      // Sandboxed and script-free, like uploads; the page's own styles are inline.
      'content-security-policy': "sandbox allow-modals; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      'cache-control': 'private, no-store',
      'x-frame-options': 'SAMEORIGIN',
    });
    res.end(body);
    return;
  }
  if (!doc.content) {
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
