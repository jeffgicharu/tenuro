import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { sql } from 'kysely';
import type { SessionInfo } from '../auth/session.ts';
import { config } from '../config.ts';
import { withScope, type Db } from '../db/client.ts';
import { viewIdIn } from '../db/viewid.ts';

// Attaching a file to a lease (POST /api/uploads; nginx allows 12 MB on that path only). The file is
// the raw body; the lease, file name and kind come in headers. Only managers and admins may attach,
// the type is checked from the file's own first bytes (not its name), and each visitor's workspace
// has its own count and size limits besides the global cap. Files land in the visitor's private
// workspace, like every other change.

export class UploadRefused extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const KINDS = ['LEASE', 'AMENDMENT', 'FLOOR_PLAN', 'PHOTO', 'CERTIFICATE', 'CORRESPONDENCE', 'OTHER'] as const;
type Kind = (typeof KINDS)[number];

// What a file is, from its first bytes; the name's extension must agree.
function sniff(body: Buffer, filename: string): { mime: string; ext: string } | null {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const starts = (...bytes: number[]) => bytes.every((b, i) => body[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return ext === 'pdf' ? { mime: 'application/pdf', ext } : null;
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ext === 'png' ? { mime: 'image/png', ext } : null;
  if (starts(0xff, 0xd8, 0xff)) return ext === 'jpg' || ext === 'jpeg' ? { mime: 'image/jpeg', ext } : null;
  if (starts(0x52, 0x49, 0x46, 0x46) && body.subarray(8, 12).toString('latin1') === 'WEBP') return ext === 'webp' ? { mime: 'image/webp', ext } : null;
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    if (ext === 'docx') return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext };
    if (ext === 'xlsx') return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext };
  }
  return null;
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new UploadRefused(413, 'too-large', `Files can be up to ${Math.round(limit / 1048576)} MB.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new UploadRefused(413, 'too-large', `Files can be up to ${Math.round(limit / 1048576)} MB.`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const header = (req: IncomingMessage, name: string) => {
  const v = req.headers[name];
  return typeof v === 'string' ? v : null;
};

export async function uploadDocument(db: Db, session: SessionInfo, req: IncomingMessage): Promise<{ id: string }> {
  if (session.role === 'VIEWER') throw new UploadRefused(403, 'forbidden', 'Read-only accounts cannot attach files.');
  if (!session.sandboxId) throw new UploadRefused(403, 'forbidden', 'Sign in again to attach files.');
  const leaseId = header(req, 'x-lease-id') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(leaseId)) throw new UploadRefused(400, 'invalid', 'Choose a lease.');
  let filename = '';
  try { filename = decodeURIComponent(header(req, 'x-filename') ?? ''); } catch { /* checked below */ }
  filename = filename.replace(/[\u0000-\u001f\\/]+/g, ' ').trim().slice(0, 160);
  if (!filename) throw new UploadRefused(400, 'invalid', 'The file needs a name.');
  const kind = (header(req, 'x-document-kind') ?? 'OTHER') as Kind;
  if (!KINDS.includes(kind)) throw new UploadRefused(400, 'invalid', 'Choose what kind of document this is.');

  const body = await readBody(req, config.limits.uploadMaxBytes);
  if (body.length === 0) throw new UploadRefused(400, 'empty', 'The file is empty.');
  const type = sniff(body, filename);
  if (!type) throw new UploadRefused(415, 'type', 'Attach a PDF, an image (PNG, JPEG or WebP), or a Word or Excel file.');

  return withScope(db, { tenantId: session.tenantId, sandboxId: session.sandboxId }, async (tx) => {
    const lease = await tx.selectFrom('v_lease').select(['lease_id']).where(viewIdIn([leaseId])).where('lease_id', '=', leaseId).executeTakeFirst();
    if (!lease) throw new UploadRefused(404, 'not-found', 'That lease could not be found.');
    // The workspace's own limits, then the global cap that protects the disk.
    const mine = await tx.selectFrom('document').select(sql<number>`count(*)::int`.as('n')).where('sandbox_id', '=', session.sandboxId).where('content', 'is not', null).executeTakeFirstOrThrow();
    if (mine.n >= config.limits.sandboxUploads) throw new UploadRefused(429, 'sandbox-uploads', `Your workspace can hold ${config.limits.sandboxUploads} attached files. Use "Reset my changes" to start again.`);
    const all = await tx.selectFrom('sandbox').select(sql<string>`coalesce(sum(upload_bytes), 0)::text`.as('n')).executeTakeFirstOrThrow();
    if (Number(all.n) + body.length > config.limits.totalUploadBytes) throw new UploadRefused(429, 'uploads-total', 'Tenuro is not accepting more files right now. Try again after the nightly reset.');
    const charged = await tx.updateTable('sandbox')
      .set({ upload_bytes: sql`upload_bytes + ${body.length}`, write_count: sql`write_count + 1`, last_active_at: sql`now()` })
      .where('id', '=', session.sandboxId).where('write_count', '<=', config.limits.sandboxWrites - 1)
      .returning('id').executeTakeFirst();
    if (!charged) throw new UploadRefused(429, 'sandbox-writes', `Your workspace has reached its limit of ${config.limits.sandboxWrites} changes. Use "Reset my changes" to start again.`);

    const id = randomUUID();
    let given = '';
    try { given = decodeURIComponent(header(req, 'x-title') ?? ''); } catch { /* falls back to the file name */ }
    given = given.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 160);
    const title = given || filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || filename;
    await tx.insertInto('document').values({
      id, tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: lease.lease_id, kind, title,
      filename, mime_type: type.mime, size_bytes: body.length, page_count: null, template: null, content: body, uploaded_by: session.userId,
    }).execute();
    await tx.insertInto('activity').values({
      id: randomUUID(), tenant_id: session.tenantId, sandbox_id: session.sandboxId, lease_id: lease.lease_id,
      actor_id: session.userId, verb: 'DOCUMENT_ATTACHED', summary: `Attached ${filename}`, diff: null,
    }).execute();
    return { id };
  });
}
