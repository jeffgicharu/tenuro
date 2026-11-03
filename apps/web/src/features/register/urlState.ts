// The register's filters, sort and active view live in the URL, so a link reproduces the exact
// view and the route loader can start the right query before the page code has loaded.

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'HOLDING_OVER' | 'EXPIRED' | 'TERMINATED';
export type PropertyType = 'OFFICE' | 'RETAIL' | 'WAREHOUSE' | 'INDUSTRIAL' | 'MIXED_USE';
export type KeyDateKind = 'BREAK_NOTICE' | 'RENEWAL_NOTICE' | 'RENT_REVIEW' | 'RENT_INCREASE' | 'EXPIRY' | 'DEPOSIT_RETURN' | 'INSURANCE' | 'CUSTOM';
export type OrderField =
  | 'REFERENCE' | 'PROPERTY_NAME' | 'CITY' | 'COUNTRY' | 'LANDLORD' | 'STATUS' | 'COMMENCEMENT_DATE'
  | 'EXPIRY_DATE' | 'ANNUAL_RENT' | 'AREA' | 'NEXT_KEY_DATE' | 'UPDATED_AT';

export interface RegisterFilter {
  search?: string;
  status?: LeaseStatus[];
  countryCode?: string[];
  city?: string[];
  propertyType?: PropertyType[];
  currency?: string[];
  expiresWithinDays?: number;
  expiry?: { from?: string; to?: string };
  annualRent?: { min?: string; max?: string };
  nextKeyWithinDays?: number;
  nextKeyKind?: KeyDateKind[];
  hasOpenBreak?: boolean;
}

export interface RegisterOrder {
  field: OrderField;
  direction: 'ASC' | 'DESC';
}

export interface RegisterState {
  filter: RegisterFilter;
  orderBy: RegisterOrder[];
  view: string | null;
}

// What needs attention first: the soonest upcoming key date (leases with none go last).
export const DEFAULT_ORDER: RegisterOrder[] = [{ field: 'NEXT_KEY_DATE', direction: 'ASC' }];

const STATUSES: readonly LeaseStatus[] = ['DRAFT', 'ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED'];
const TYPES: readonly PropertyType[] = ['OFFICE', 'RETAIL', 'WAREHOUSE', 'INDUSTRIAL', 'MIXED_USE'];
const KINDS: readonly KeyDateKind[] = ['BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'RENT_INCREASE', 'EXPIRY', 'DEPOSIT_RETURN', 'INSURANCE', 'CUSTOM'];
const FIELDS: readonly OrderField[] = ['REFERENCE', 'PROPERTY_NAME', 'CITY', 'COUNTRY', 'LANDLORD', 'STATUS', 'COMMENCEMENT_DATE',
  'EXPIRY_DATE', 'ANNUAL_RENT', 'AREA', 'NEXT_KEY_DATE', 'UPDATED_AT'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d{1,15}(\.\d{1,4})?$/;

const pick = <T extends string>(values: string[], allowed: readonly T[]) => values.filter((v): v is T => (allowed as readonly string[]).includes(v));
const posInt = (v: string | null, max: number) => {
  if (!v || !/^\d{1,5}$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 && n <= max ? n : undefined;
};

// Unknown or malformed values are dropped, so a hand-edited URL can never send a bad query.
export function parseState(params: URLSearchParams): RegisterState {
  const f: RegisterFilter = {};
  const search = params.get('q')?.trim();
  if (search) f.search = search.slice(0, 100);
  const status = pick(params.getAll('status'), STATUSES);
  if (status.length) f.status = status;
  const country = params.getAll('country').filter((c) => /^[A-Z]{2}$/.test(c));
  if (country.length) f.countryCode = country;
  const city = params.getAll('city').map((c) => c.slice(0, 80)).filter(Boolean);
  if (city.length) f.city = city;
  const type = pick(params.getAll('type'), TYPES);
  if (type.length) f.propertyType = type;
  const currency = params.getAll('currency').filter((c) => /^[A-Z]{3}$/.test(c));
  if (currency.length) f.currency = currency;
  const exp = posInt(params.get('expIn'), 36_500);
  if (exp) f.expiresWithinDays = exp;
  const from = params.get('expFrom');
  const to = params.get('expTo');
  if ((from && ISO.test(from)) || (to && ISO.test(to))) {
    f.expiry = {};
    if (from && ISO.test(from)) f.expiry.from = from;
    if (to && ISO.test(to)) f.expiry.to = to;
  }
  const min = params.get('rentMin');
  const max = params.get('rentMax');
  if ((min && DECIMAL.test(min)) || (max && DECIMAL.test(max))) {
    f.annualRent = {};
    if (min && DECIMAL.test(min)) f.annualRent.min = min;
    if (max && DECIMAL.test(max)) f.annualRent.max = max;
  }
  const keyIn = posInt(params.get('keyIn'), 3_650);
  if (keyIn) f.nextKeyWithinDays = keyIn;
  const keyKind = pick(params.getAll('keyKind'), KINDS);
  if (keyKind.length) f.nextKeyKind = keyKind;
  if (params.get('break') === '1') f.hasOpenBreak = true;

  const orderBy = params.getAll('sort').map((s) => {
    const [field, dir] = s.split('.');
    return field && (FIELDS as readonly string[]).includes(field) ? { field: field as OrderField, direction: dir === 'desc' ? 'DESC' as const : 'ASC' as const } : null;
  }).filter((o): o is RegisterOrder => o !== null).slice(0, 3);

  const view = params.get('view');
  return { filter: f, orderBy: orderBy.length ? orderBy : DEFAULT_ORDER, view: view && view.length < 200 ? view : null };
}

export function toParams(state: RegisterState): URLSearchParams {
  const p = new URLSearchParams();
  const f = state.filter;
  if (state.view) p.set('view', state.view);
  if (f.search) p.set('q', f.search);
  f.status?.forEach((v) => p.append('status', v));
  f.countryCode?.forEach((v) => p.append('country', v));
  f.city?.forEach((v) => p.append('city', v));
  f.propertyType?.forEach((v) => p.append('type', v));
  f.currency?.forEach((v) => p.append('currency', v));
  if (f.expiresWithinDays) p.set('expIn', String(f.expiresWithinDays));
  if (f.expiry?.from) p.set('expFrom', f.expiry.from);
  if (f.expiry?.to) p.set('expTo', f.expiry.to);
  if (f.annualRent?.min) p.set('rentMin', f.annualRent.min);
  if (f.annualRent?.max) p.set('rentMax', f.annualRent.max);
  if (f.nextKeyWithinDays) p.set('keyIn', String(f.nextKeyWithinDays));
  f.nextKeyKind?.forEach((v) => p.append('keyKind', v));
  if (f.hasOpenBreak) p.set('break', '1');
  const isDefault = state.orderBy.length === 1 && state.orderBy[0]!.field === DEFAULT_ORDER[0]!.field && state.orderBy[0]!.direction === DEFAULT_ORDER[0]!.direction;
  if (!isDefault) state.orderBy.forEach((o) => p.append('sort', `${o.field}.${o.direction.toLowerCase()}`));
  return p;
}

export const activeFilterCount = (f: RegisterFilter) => Object.values(f).filter((v) => v !== undefined && !(Array.isArray(v) && v.length === 0)).length;

// The GraphQL input: only set keys, so the persisted query's variables stay small.
export function toGraphQLFilter(f: RegisterFilter): RegisterFilter | null {
  return activeFilterCount(f) ? f : null;
}

export const stateKey = (s: Pick<RegisterState, 'filter' | 'orderBy'>) => JSON.stringify([s.filter, s.orderBy]);

// Saved views store { filters, sort, columns }; seed views and saved ones share the shape.
export interface ViewConfig {
  filters?: RegisterFilter;
  sort?: RegisterOrder[];
  columns?: Record<string, boolean>;
}

export function parseViewConfig(json: string): ViewConfig {
  try {
    const v = JSON.parse(json) as ViewConfig;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// Round-trips a view's filters through the URL parser so a stored view can never carry bad values.
export function sanitiseViewFilters(filters: RegisterFilter | undefined, sort: RegisterOrder[] | undefined): Pick<RegisterState, 'filter' | 'orderBy'> {
  const clean = parseState(toParams({ filter: filters ?? {}, orderBy: sort?.length ? sort : DEFAULT_ORDER, view: null }));
  return { filter: clean.filter, orderBy: clean.orderBy };
}
