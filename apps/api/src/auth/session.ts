import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from '../db/client.ts';
import type { UserRole } from '../db/types.ts';
import { config } from '../config.ts';

export interface SessionInfo {
  userId: string;
  tenantId: string;
  role: UserRole;
  sandboxId: string | null;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// IPs are never stored; a keyed hash is enough to count per-address limits.
export const hashIp = (ip: string) => createHmac('sha256', config.sessionSecret).update(`ip:${ip}`).digest('hex').slice(0, 32);

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token: string | null): string {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (config.production) attrs.push('Secure');
  if (token === null) return `${config.cookieName}=; ${attrs.join('; ')}; Max-Age=0`;
  return `${config.cookieName}=${encodeURIComponent(token)}; ${attrs.join('; ')}; Max-Age=${config.sessionDays * 86_400}`;
}

export async function resolveSession(db: Db, token: string | null): Promise<SessionInfo | null> {
  if (!token || token.length > 128) return null;
  const { rows } = await sql<{ user_id: string; tenant_id: string; role: UserRole; sandbox_id: string | null }>`
    SELECT * FROM app.resolve_session(${hashToken(token)})`.execute(db);
  const r = rows[0];
  return r ? { userId: r.user_id, tenantId: r.tenant_id, role: r.role, sandboxId: r.sandbox_id } : null;
}

export class LimitReached extends Error {
  readonly limit: string;
  constructor(limit: string) {
    super(`limit reached: ${limit}`);
    this.limit = limit;
  }
}

// Signs in to one of the accounts listed on the sign-in page. An existing sandbox is kept, so a
// person can switch role or company and still see their own changes; otherwise a new sandbox is
// made, within the per-IP and global caps.
export async function signIn(db: Db, opts: { accountId: string; existingToken: string | null; ip: string }): Promise<{ token: string } | null> {
  const ipHash = hashIp(opts.ip);
  const { limits } = config;
  return db.transaction().execute(async (tx) => {
    // Serialise sign-ins per address so concurrent requests cannot slip past the per-IP caps.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${ipHash}))`.execute(tx);
    const account = await tx.selectFrom('app_user').select(['id']).where('id', '=', opts.accountId).where('listed_for_sign_in', '=', true).executeTakeFirst();
    if (!account) return null;

    let sandboxId: string | null = null;
    if (opts.existingToken) {
      // Expire rather than delete, so the per-address count still sees every session created this hour.
      const prior = await tx.updateTable('session').set({ expires_at: sql<Date>`now()` as unknown as Date })
        .where('token_hash', '=', hashToken(opts.existingToken)).where('expires_at', '>', sql<Date>`now()`)
        .returning('sandbox_id').executeTakeFirst();
      sandboxId = prior?.sandbox_id ?? null;
    }

    const recentSessions = await tx.selectFrom('session').select(sql<number>`count(*)::int`.as('n'))
      .where('ip_hash', '=', ipHash).where('created_at', '>', sql<Date>`now() - interval '1 hour'`).executeTakeFirstOrThrow();
    if (recentSessions.n >= limits.newSessionsPerIpPerHour) throw new LimitReached('sessions-per-ip');
    const totalSessions = await tx.selectFrom('session').select(sql<number>`count(*)::int`.as('n'))
      .where('expires_at', '>', sql<Date>`now()`).executeTakeFirstOrThrow();
    if (totalSessions.n >= limits.maxSessions) throw new LimitReached('sessions-total');

    if (!sandboxId) {
      const today = await tx.selectFrom('sandbox').select(sql<number>`count(*)::int`.as('n'))
        .where('ip_hash', '=', ipHash).where('created_at', '>', sql<Date>`now() - interval '1 day'`).executeTakeFirstOrThrow();
      if (today.n >= limits.newSandboxesPerIpPerDay) throw new LimitReached('sandboxes-per-ip');
      const total = await tx.selectFrom('sandbox').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
      if (total.n >= limits.maxSandboxes) throw new LimitReached('sandboxes-total');
      sandboxId = randomUUID();
      await tx.insertInto('sandbox').values({ id: sandboxId, ip_hash: ipHash }).execute();
    }

    const token = randomBytes(32).toString('base64url');
    await tx.insertInto('session').values({
      token_hash: hashToken(token), user_id: account.id, sandbox_id: sandboxId, ip_hash: ipHash,
      expires_at: sql<Date>`now() + make_interval(days => ${config.sessionDays})` as unknown as Date,
    }).execute();
    return { token };
  });
}

export async function signOut(db: Db, token: string | null): Promise<void> {
  if (!token) return;
  await db.deleteFrom('session').where('token_hash', '=', hashToken(token)).execute();
}
