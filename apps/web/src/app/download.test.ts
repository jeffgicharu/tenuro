import { describe, expect, it } from 'vitest';
import { toCsv } from './download.ts';

describe('CSV export', () => {
  it('quotes commas, quotes and newlines, keeps negative numbers, and defuses formulas', () => {
    expect(toCsv([['a,b', 'say "hi"', 'two\nlines', -12.5, '=HYPERLINK("x")', '+1 Nairobi', null]]))
      .toBe('"a,b","say ""hi""","two\nlines",-12.5,"\'=HYPERLINK(""x"")",\'+1 Nairobi,');
  });
});
