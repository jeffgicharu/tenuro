import DecimalJs from 'decimal.js';
import { LedgerError } from './errors.js';

/** Decimal constructor used for every figure in the ledger: 34 significant digits, ties away from zero. */
export const D = DecimalJs.clone({ precision: 34, rounding: DecimalJs.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

/** A decimal value accepted at the API boundary. Prefer strings; numbers are converted via their shortest decimal form. */
export type DecimalInput = string | number;

export const ZERO = new D(0);
export const ONE = new D(1);

const MINOR_UNITS: Readonly<Record<string, number>> = {
  AED: 2, CHF: 2, EUR: 2, GBP: 2, KES: 2, QAR: 2, SAR: 2, TZS: 2, USD: 2, ZAR: 2,
  BHD: 3, JOD: 3, KWD: 3, OMR: 3,
  JPY: 0, RWF: 0, UGX: 0,
};

export function minorUnits(currency: string): number {
  const units = MINOR_UNITS[currency];
  if (units === undefined) {
    throw new LedgerError('UNKNOWN_CURRENCY', `No minor-unit rule for currency ${currency}`);
  }
  return units;
}

export function supportedCurrencies(): string[] {
  return Object.keys(MINOR_UNITS).sort();
}

export function dec(value: DecimalInput, field: string): Dec {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new LedgerError('INVALID_INPUT', `${field} must be a finite number`);
  }
  try {
    return new D(value);
  } catch {
    throw new LedgerError('INVALID_INPUT', `${field} is not a valid decimal: ${String(value)}`);
  }
}

/** Round half away from zero to the currency's minor unit. */
export function roundMoney(value: Dec, dp: number): Dec {
  return value.toDecimalPlaces(dp, D.ROUND_HALF_UP);
}

/**
 * Fixed-point string at the minor unit. Values the ledger formats are already rounded, so the
 * common path pads `toString()` (several times faster than `toFixed`); anything else falls back
 * to `toFixed`, which applies the constructor's half-up rounding.
 */
export function fmt(value: Dec, dp: number): string {
  if (value.isZero()) return dp === 0 ? '0' : `0.${'0'.repeat(dp)}`;
  const s = value.toString();
  if (s.includes('e')) return value.toFixed(dp);
  const dot = s.indexOf('.');
  if (dot === -1) return dp === 0 ? s : `${s}.${'0'.repeat(dp)}`;
  const decimals = s.length - dot - 1;
  if (decimals > dp) return value.toFixed(dp);
  return decimals === dp ? s : s + '0'.repeat(dp - decimals);
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(v), ZERO);
}
