import DataLoader from 'dataloader';
import { sql, type Selectable } from 'kysely';
import type { Db, Tx } from '../db/client.ts';
import type {
  AppUserTable, DepositTable, EscalationTable, LeaseOptionTable, LeasePartyTable, PropertyTable, RentStepTable, TenantTable, UserRole,
} from '../db/types.ts';
import type { SessionInfo } from '../auth/session.ts';
import { config } from '../config.ts';
import { todayIso } from '../domain/dates.ts';
import { PermissionDenied, QuotaExceeded } from './errors.ts';
import type { LeaseRow } from './types/lease-shape.ts';

export interface Context {
  db: Db;
  tx: Tx;
  session: SessionInfo | null;
  ipHash: string;
  today: string;
  loaders: Loaders;
}

export type Loaders = ReturnType<typeof createLoaders>;

const byKey = <K, T>(keys: readonly K[], rows: T[], key: (r: T) => K) => {
  const map = new Map(rows.map((r) => [key(r), r]));
  return keys.map((k) => map.get(k) ?? null);
};

const groupBy = <K, T>(keys: readonly K[], rows: T[], key: (r: T) => K) => {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return keys.map((k) => map.get(k) ?? []);
};

// One set of loaders per request, bound to that request's scoped transaction.
export function createLoaders(tx: Tx) {
  const children = <T extends { lease_row_id: string }>(table: 'lease_party' | 'rent_step' | 'escalation' | 'lease_option' | 'deposit', order: string) =>
    new DataLoader<string, T[]>(async (ids) => {
      const rows = (await tx.selectFrom(table).selectAll().where('lease_row_id', 'in', ids as string[])
        .orderBy(sql.ref(order)).execute()) as unknown as T[];
      return groupBy(ids, rows, (r) => r.lease_row_id);
    });

  return {
    tenant: new DataLoader<string, Selectable<TenantTable> | null>(async (ids) =>
      byKey(ids, await tx.selectFrom('tenant').selectAll().where('id', 'in', ids as string[]).execute(), (r) => r.id)),
    tenantSummary: new DataLoader<string, { tenant_id: string; lease_count: number; countries: string[] } | null>(async (ids) => {
      const { rows } = await sql<{ tenant_id: string; lease_count: number; countries: string[] }>`SELECT * FROM app.tenant_summary()`.execute(tx);
      return byKey(ids, rows, (r) => r.tenant_id);
    }),
    user: new DataLoader<string, Selectable<AppUserTable> | null>(async (ids) =>
      byKey(ids, await tx.selectFrom('app_user').selectAll().where('id', 'in', ids as string[]).execute(), (r) => r.id)),
    property: new DataLoader<string, Selectable<PropertyTable> | null>(async (ids) =>
      byKey(ids, await tx.selectFrom('property').selectAll().where('id', 'in', ids as string[]).execute(), (r) => r.id)),
    // Loads by logical id; the view returns the caller's overlay copy when one exists.
    lease: new DataLoader<string, LeaseRow | null>(async (ids) =>
      byKey(ids, (await tx.selectFrom('v_lease').selectAll().where('lease_id', 'in', ids as string[]).execute()) as LeaseRow[], (r) => r.lease_id)),
    // Loads one specific lease row (a version), e.g. to find the currency of its child rows.
    leaseByRow: new DataLoader<string, { id: string; currency: string } | null>(async (ids) =>
      byKey(ids, await tx.selectFrom('lease').select(['id', 'currency']).where('id', 'in', ids as string[]).execute(), (r) => r.id)),
    parties: children<Selectable<LeasePartyTable>>('lease_party', 'position'),
    rentSteps: children<Selectable<RentStepTable>>('rent_step', 'starts_on'),
    escalations: children<Selectable<EscalationTable>>('escalation', 'first_review_on'),
    options: children<Selectable<LeaseOptionTable>>('lease_option', 'exercise_on'),
    deposits: children<Selectable<DepositTable>>('deposit', 'kind'),
  };
}

export function requireSession(ctx: Context): SessionInfo {
  if (!ctx.session) throw new PermissionDenied('MANAGER');
  return ctx.session;
}

const RANK: Record<UserRole, number> = { VIEWER: 0, MANAGER: 1, ADMIN: 2 };

// Every write goes through here: the role check happens in the API, whatever the UI shows.
export function requireRole(ctx: Context, role: 'MANAGER' | 'ADMIN'): SessionInfo {
  const s = requireSession(ctx);
  if (RANK[s.role] < RANK[role]) throw new PermissionDenied(role);
  return s;
}

// Counts a write against the visitor's sandbox and refuses it past the quota or the global row cap.
export async function chargeWrite(ctx: Context, rows = 1): Promise<void> {
  const sandboxId = ctx.session?.sandboxId;
  if (!sandboxId) return;
  // Each charged write is one overlay row or fewer, so the sum is an upper bound on overlay rows.
  const total = await ctx.tx.selectFrom('sandbox').select(sql<number>`coalesce(sum(write_count), 0)::int`.as('n')).executeTakeFirstOrThrow();
  if (total.n + rows > config.limits.maxOverlayRows) {
    throw new QuotaExceeded('overlay-total', 'The site is busy right now and is not accepting more changes. Try again after the nightly reset.');
  }
  const updated = await ctx.tx.updateTable('sandbox')
    .set({ write_count: sql`write_count + ${rows}`, last_active_at: sql`now()` })
    .where('id', '=', sandboxId).where('write_count', '<=', config.limits.sandboxWrites - rows)
    .returning('write_count').executeTakeFirst();
  if (!updated) {
    throw new QuotaExceeded('sandbox-writes', `Your private copy has reached its limit of ${config.limits.sandboxWrites} changes. Use "Reset my changes" to start again.`);
  }
}

export const newContext = (db: Db, session: SessionInfo | null, ipHash: string): Omit<Context, 'tx' | 'loaders'> => ({
  db, session, ipHash, today: todayIso(),
});
