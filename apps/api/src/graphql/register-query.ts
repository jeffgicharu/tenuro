import { sql, type ExpressionBuilder, type SelectQueryBuilder } from 'kysely';
import type { Database, KeyDateKind, LeaseStatus, PropertyType } from '../db/types.ts';
import { addDays } from '../domain/dates.ts';

export interface LeaseFilterInput {
  search?: string | null;
  status?: LeaseStatus[] | null;
  countryCode?: string[] | null;
  city?: string[] | null;
  propertyType?: PropertyType[] | null;
  currency?: string[] | null;
  expiry?: { from?: string | null; to?: string | null } | null;
  expiresWithinDays?: number | null;
  annualRent?: { min?: string | null; max?: string | null } | null;
  nextKeyWithinDays?: number | null;
  nextKeyKind?: KeyDateKind[] | null;
  hasOpenBreak?: boolean | null;
  changedInSandbox?: boolean | null;
}

export type LeaseOrderField =
  | 'REFERENCE' | 'PROPERTY_NAME' | 'CITY' | 'COUNTRY' | 'LANDLORD' | 'STATUS' | 'COMMENCEMENT_DATE'
  | 'EXPIRY_DATE' | 'ANNUAL_RENT' | 'AREA' | 'NEXT_KEY_DATE' | 'UPDATED_AT';

export interface LeaseOrderInput {
  field: LeaseOrderField;
  direction: 'ASC' | 'DESC';
}

const ORDER_COLUMN = {
  REFERENCE: 'reference', PROPERTY_NAME: 'property_name', CITY: 'city', COUNTRY: 'country_code', LANDLORD: 'landlord_name',
  STATUS: 'status', COMMENCEMENT_DATE: 'commencement_date', EXPIRY_DATE: 'expiry_date', ANNUAL_RENT: 'annual_rent_reporting',
  AREA: 'area_sqm', NEXT_KEY_DATE: 'next_key_date', UPDATED_AT: 'updated_at',
} as const satisfies Record<LeaseOrderField, keyof Database['v_lease']>;

type LeaseQb = SelectQueryBuilder<Database, 'v_lease', object>;

// Escapes LIKE wildcards so a search for "50%" means the characters, not a pattern.
const likeTerm = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function applyLeaseFilter<Q extends LeaseQb>(qb: Q, f: LeaseFilterInput | null | undefined, today: string): Q {
  if (!f) return qb;
  let q = qb as LeaseQb;
  const search = f.search?.trim();
  if (search) {
    const term = likeTerm(search.slice(0, 100));
    q = q.where((eb: ExpressionBuilder<Database, 'v_lease'>) => eb.or([
      eb('reference', 'ilike', term), eb('property_name', 'ilike', term), eb('landlord_name', 'ilike', term),
      eb('city', 'ilike', term), eb('premises', 'ilike', term), eb('cost_centre', 'ilike', term),
    ]));
  }
  if (f.status?.length) q = q.where('status', 'in', f.status);
  if (f.countryCode?.length) q = q.where('country_code', 'in', f.countryCode);
  if (f.city?.length) q = q.where('city', 'in', f.city);
  if (f.propertyType?.length) q = q.where('property_type', 'in', f.propertyType);
  if (f.currency?.length) q = q.where('currency', 'in', f.currency);
  if (f.expiry?.from) q = q.where('expiry_date', '>=', f.expiry.from);
  if (f.expiry?.to) q = q.where('expiry_date', '<=', f.expiry.to);
  if (f.expiresWithinDays != null) {
    q = q.where('expiry_date', '>=', today).where('expiry_date', '<=', addDays(today, Math.max(0, Math.min(f.expiresWithinDays, 36_500))));
  }
  if (f.annualRent?.min) q = q.where('annual_rent_reporting', '>=', f.annualRent.min);
  if (f.annualRent?.max) q = q.where('annual_rent_reporting', '<=', f.annualRent.max);
  if (f.nextKeyWithinDays != null) {
    q = q.where('next_key_date', '>=', today).where('next_key_date', '<=', addDays(today, Math.max(0, Math.min(f.nextKeyWithinDays, 3_650))));
  }
  if (f.nextKeyKind?.length) q = q.where('next_key_kind', 'in', f.nextKeyKind);
  if (f.hasOpenBreak != null) {
    const exists = sql<boolean>`EXISTS (SELECT 1 FROM lease_option o WHERE o.lease_row_id = v_lease.id AND o.kind = 'BREAK' AND o.status = 'OPEN' AND o.exercise_on >= ${today})`;
    q = q.where(f.hasOpenBreak ? exists : sql<boolean>`NOT ${exists}`);
  }
  if (f.changedInSandbox != null) q = q.where('sandbox_id', f.changedInSandbox ? 'is not' : 'is', null);
  return q as Q;
}

export function applyLeaseOrder<Q extends LeaseQb>(qb: Q, order: readonly LeaseOrderInput[] | null | undefined): Q {
  let q = qb as LeaseQb;
  const list = order?.length ? order.slice(0, 3) : [{ field: 'EXPIRY_DATE', direction: 'ASC' } as const];
  for (const o of list) {
    const col = ORDER_COLUMN[o.field];
    q = q.orderBy(col, (ob) => (o.direction === 'DESC' ? ob.desc().nullsLast() : ob.asc().nullsLast()));
  }
  // A unique tie-breaker keeps pages stable when many rows share a sort value.
  return q.orderBy('lease_id') as Q;
}
