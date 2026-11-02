// The key dates page's state lives in the URL, so views and filters can be shared and reloaded.
export type KeyDateKind = 'BREAK_NOTICE' | 'RENEWAL_NOTICE' | 'RENT_REVIEW' | 'EXPIRY' | 'DEPOSIT_RETURN' | 'INSURANCE' | 'CUSTOM';
export type KeyDatesView = 'list' | 'calendar' | 'next90';

export const KINDS: KeyDateKind[] = ['BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'EXPIRY', 'DEPOSIT_RETURN', 'INSURANCE'];

export interface KeyDatesState {
  view: KeyDatesView;
  kinds: KeyDateKind[];
  mine: boolean;
  overdue: boolean;
  q: string;
  month: string; // YYYY-MM, for the calendar
  day: string | null; // YYYY-MM-DD picked in the calendar
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export function parseKeyDates(p: URLSearchParams): KeyDatesState {
  const view = p.get('view');
  const month = p.get('month');
  const day = p.get('day');
  return {
    view: view === 'calendar' || view === 'next90' ? view : 'list',
    kinds: p.getAll('kind').filter((k): k is KeyDateKind => (KINDS as string[]).includes(k)),
    mine: p.get('mine') === '1',
    overdue: p.get('overdue') === '1',
    q: (p.get('q') ?? '').slice(0, 80),
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : isoToday().slice(0, 7),
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
  };
}

export function toKeyDatesParams(s: KeyDatesState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view !== 'list') p.set('view', s.view);
  s.kinds.forEach((k) => p.append('kind', k));
  if (s.mine) p.set('mine', '1');
  if (s.overdue) p.set('overdue', '1');
  if (s.q) p.set('q', s.q);
  if (s.view === 'calendar' && s.month !== isoToday().slice(0, 7)) p.set('month', s.month);
  if (s.view === 'calendar' && s.day) p.set('day', s.day);
  return p;
}

export interface GraphQLKeyDateFilter {
  kinds?: KeyDateKind[];
  overdue?: boolean;
  mine?: boolean;
  search?: string;
  from?: string;
  to?: string;
}

// The list's filter for the current view: the next 90 days view and a picked calendar day narrow it.
export function listFilter(s: KeyDatesState): GraphQLKeyDateFilter {
  const f: GraphQLKeyDateFilter = {};
  if (s.kinds.length) f.kinds = s.kinds;
  if (s.overdue) f.overdue = true;
  if (s.mine) f.mine = true;
  if (s.q.trim()) f.search = s.q.trim();
  if (s.view === 'next90') {
    f.from = isoToday();
    f.to = addDaysIso(isoToday(), 90);
  }
  if (s.view === 'calendar' && s.day) {
    f.from = s.day;
    f.to = s.day;
  }
  return f;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const filterKey = (f: GraphQLKeyDateFilter) => JSON.stringify(f);
