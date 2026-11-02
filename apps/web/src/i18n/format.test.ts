import { describe, expect, it } from 'vitest';
import { makeFormatters } from './format.ts';

describe('formatters', () => {
  it('formats money exactly from decimal strings, with the currency minor unit', () => {
    const f = makeFormatters('en-KE');
    expect(f.money('1250000', 'KES')).toBe('KES 1,250,000.00');
    expect(f.money('9007199254740993.25', 'USD')).toContain('9,007,199,254,740,993.25');
    expect(f.money('4500000', 'UGX')).toBe('UGX 4,500,000');
    expect(f.money('1250.125', 'BHD')).toBe('BHD 1,250.125');
  });

  it('shows negative money in accounting brackets', () => {
    expect(makeFormatters('en-GB').money('-1200', 'GBP')).toBe('(GBP 1,200.00)');
  });

  it('never shifts a calendar date across time zones', () => {
    const f = makeFormatters('en-GB');
    expect(f.date('2027-01-01', 'long')).toBe('1 January 2027');
    expect(f.date('2026-12-31', 'short')).toBe('31/12/2026');
  });

  it('formats Arabic and Swahili dates with their own month names', () => {
    expect(makeFormatters('ar-AE').date('2027-03-01', 'long')).toMatch(/مارس/);
    expect(makeFormatters('sw-KE').date('2027-03-01', 'long')).toMatch(/Machi/);
  });

  it('describes distances in time naturally', () => {
    const f = makeFormatters('en-GB');
    expect(f.relativeDays(1)).toBe('tomorrow');
    expect(f.relativeDays(-10)).toBe('10 days ago');
    expect(f.relativeDays(120)).toBe('in 4 months');
    expect(f.relativeDays(900)).toBe('in 2.5 years');
  });
});
