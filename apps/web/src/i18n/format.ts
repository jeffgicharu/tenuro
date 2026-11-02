import { useMemo } from 'react';
import { useIntl } from 'react-intl';

const MINOR: Record<string, number> = { UGX: 0, RWF: 0, BHD: 3, OMR: 3 };
export const minorUnits = (currency: string) => MINOR[currency] ?? 2;

// Calendar dates are anchored at UTC midnight and formatted in UTC, so no time zone moves the day.
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export interface Formatters {
  locale: string;
  money(amount: string, currency: string, opts?: { compact?: boolean; showCode?: boolean; whole?: boolean }): string;
  number(value: string | number, opts?: { maxFractionDigits?: number; compact?: boolean }): string;
  percent(fraction: string | number, digits?: number): string;
  date(iso: string, style?: 'short' | 'medium' | 'long'): string;
  monthYear(iso: string): string;
  dateTime(iso: string): string;
  relativeDays(days: number): string;
  area(sqm: string | number): string;
}

export function makeFormatters(locale: string): Formatters {
  const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
  const nf = (key: string, make: () => Intl.NumberFormat) => (cache.get(key) ?? cache.set(key, make()).get(key)) as Intl.NumberFormat;
  const df = (key: string, make: () => Intl.DateTimeFormat) => (cache.get(key) ?? cache.set(key, make()).get(key)) as Intl.DateTimeFormat;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  return {
    locale,
    money(amount, currency, opts = {}) {
      // whole: rounded to the unit, for tables where cents on multi-million figures are noise.
      const digits = opts.compact ? 1 : opts.whole ? 0 : minorUnits(currency);
      const f = nf(`m:${currency}:${opts.compact ? 'c' : 'f'}:${opts.showCode === false ? 'n' : 'y'}:${opts.whole ? 'w' : ''}`, () => new Intl.NumberFormat(locale, {
        style: opts.showCode === false ? 'decimal' : 'currency',
        currency, currencyDisplay: 'code',
        notation: opts.compact ? 'compact' : 'standard',
        minimumFractionDigits: opts.compact ? 0 : digits,
        maximumFractionDigits: digits,
        currencySign: 'accounting',
      }));
      // Intl formats decimal strings exactly; the value never passes through a float.
      return f.format(amount as unknown as number);
    },
    number(value, opts = {}) {
      return nf(`n:${opts.maxFractionDigits ?? 2}:${opts.compact ? 'c' : ''}`, () => new Intl.NumberFormat(locale, {
        maximumFractionDigits: opts.maxFractionDigits ?? 2, notation: opts.compact ? 'compact' : 'standard',
      })).format(value as unknown as number);
    },
    percent(fraction, digits = 2) {
      return nf(`p:${digits}`, () => new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: digits }))
        .format(Number(fraction));
    },
    date(iso, style = 'medium') {
      const options: Intl.DateTimeFormatOptions = style === 'short'
        ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }
        : style === 'long'
          ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
          : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
      return df(`d:${style}`, () => new Intl.DateTimeFormat(locale, options)).format(asDate(iso));
    },
    monthYear(iso) {
      return df('my', () => new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })).format(asDate(iso));
    },
    dateTime(iso) {
      return df('dt', () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })).format(new Date(iso));
    },
    relativeDays(days) {
      const abs = Math.abs(days);
      if (abs < 45) return rtf.format(days, 'day');
      if (abs < 548) return rtf.format(Math.round(days / 30.44), 'month');
      return rtf.format(Math.round((days / 365.25) * 10) / 10, 'year');
    },
    area(sqm) {
      // Arabic writes the unit as م², which reads after the number in right-to-left text; elsewhere m².
      const unit = locale.startsWith('ar') ? 'م²' : 'm²';
      return `${nf('a', () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })).format(sqm as unknown as number)} ${unit}`;
    },
  };
}

export function useFormat(): Formatters {
  const { locale } = useIntl();
  return useMemo(() => makeFormatters(locale), [locale]);
}
