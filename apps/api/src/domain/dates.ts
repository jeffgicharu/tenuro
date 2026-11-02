// Calendar-date arithmetic on 'YYYY-MM-DD' strings in UTC, so no local time zone can shift a date.

export type IsoDate = string;

const parse = (iso: IsoDate) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};

const fmt = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isValidIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { y, m, d } = parse(value);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

// Adds months, clamping to the month end (31 Jan + 1 month = 28/29 Feb).
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export const addYears = (iso: IsoDate, years: number) => addMonths(iso, years * 12);

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Whole months from `from` to `to`, counting a month only once its day is reached.
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = parse(from);
  const b = parse(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d && b.d < daysInMonth(b.y, b.m)) months -= 1;
  return months;
}

export const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
export const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

export function todayIso(now = new Date(), timeZone = 'Africa/Nairobi'): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
