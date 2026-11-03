import { describe, expect, it } from 'vitest';
import { optionStatus } from './options.ts';

describe('option status', () => {
  // Regression: NL-R-01154's renewal option (notice by 30 Sep 2025) still read "Open" in November 2026.
  it('lapses an open option once its notice deadline has passed', () => {
    expect(optionStatus('OPEN', '2026-01-01', '2025-09-30', '2026-11-03')).toBe('LAPSED');
  });

  it('stays open up to and including the notice deadline', () => {
    expect(optionStatus('OPEN', '2027-05-01', '2026-11-03', '2026-11-03')).toBe('OPEN');
    expect(optionStatus('OPEN', '2027-05-01', '2026-11-04', '2026-11-03')).toBe('OPEN');
  });

  it('lapses after a notice deadline even when the exercise date is still ahead', () => {
    expect(optionStatus('OPEN', '2027-05-01', '2026-11-01', '2026-11-03')).toBe('LAPSED');
  });

  it('uses the exercise date when there is no notice deadline', () => {
    expect(optionStatus('OPEN', '2026-11-02', null, '2026-11-03')).toBe('LAPSED');
    expect(optionStatus('OPEN', '2026-11-03', null, '2026-11-03')).toBe('OPEN');
  });

  it('leaves a decided option as it was recorded', () => {
    for (const s of ['EXERCISED', 'WAIVED', 'LAPSED'] as const) expect(optionStatus(s, '2020-01-01', '2019-06-01', '2026-11-03')).toBe(s);
  });
});
