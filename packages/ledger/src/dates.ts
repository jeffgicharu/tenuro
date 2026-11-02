import { LedgerError } from './errors.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: string): Ymd {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new LedgerError('INVALID_INPUT', `Expected an ISO date (YYYY-MM-DD), got ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new LedgerError('INVALID_INPUT', `Not a calendar date: ${iso}`);
  }
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function format({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function assertIsoDate(iso: string): void {
  parse(iso);
}

/** Adds calendar months, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return format({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return format({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** ISO dates compare correctly as strings. */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
