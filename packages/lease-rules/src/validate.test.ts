import { describe, expect, it } from 'vitest';
import { emptyLeaseForm, type LeaseFormData } from './types.ts';
import { monthsInTerm, validateLease } from './validate.ts';

const valid = (): LeaseFormData => {
  const f = emptyLeaseForm({ currency: 'KES', lesseeEntity: 'Mbuyu Court Holdings (Kenya) Limited' });
  f.parties.landlord.name = 'Nyakoro Properties Limited';
  f.property = { propertyId: 'UHJvcGVydHk6MQ==', premises: 'Level 4, North', areaSqm: '420' };
  f.term = { commencementDate: '2026-01-01', expiryDate: '2031-12-31' };
  f.rent.rentPerPeriod = '1250000';
  f.accounting.discountRatePercent = '13.5';
  return f;
};

const codes = (f: LeaseFormData) => validateLease(f).map((i) => `${i.path}:${i.code}`);

describe('monthsInTerm', () => {
  it('counts whole calendar years exactly', () => {
    expect(monthsInTerm('2026-01-01', '2026-12-31')).toBe(12);
    expect(monthsInTerm('2026-01-15', '2027-01-14')).toBe(12);
  });
  it('rounds part months up', () => {
    expect(monthsInTerm('2026-01-15', '2027-01-20')).toBe(13);
    expect(monthsInTerm('2026-03-01', '2026-03-10')).toBe(1);
  });
  it('handles month ends', () => {
    expect(monthsInTerm('2026-01-31', '2026-02-27')).toBe(1);
    expect(monthsInTerm('2024-02-29', '2025-02-27')).toBe(12);
  });
});

describe('validateLease', () => {
  it('accepts a complete lease', () => {
    expect(codes(valid())).toEqual([]);
  });

  it('reports every missing required field on its own step', () => {
    const issues = validateLease(emptyLeaseForm({ currency: 'KES', lesseeEntity: '' }));
    const byStep = new Set(issues.map((i) => i.step));
    expect(byStep).toEqual(new Set(['parties', 'property', 'term', 'rent', 'accounting']));
  });

  it('can validate a single step', () => {
    const f = valid();
    f.term.expiryDate = '2025-01-01';
    f.rent.rentPerPeriod = '';
    expect(validateLease(f, ['rent']).map((i) => i.code)).toEqual(['required']);
  });

  it('rejects an expiry before commencement', () => {
    const f = valid();
    f.term.expiryDate = '2025-12-31';
    expect(codes(f)).toContain('term.expiryDate:date_before');
  });

  it('respects the currency minor unit', () => {
    const f = valid();
    f.rent.currency = 'UGX';
    f.rent.rentPerPeriod = '4500000.50';
    expect(codes(f)).toContain('rent.rentPerPeriod:too_many_decimals');
    f.rent.currency = 'BHD';
    f.rent.rentPerPeriod = '1250.125';
    expect(codes(f)).not.toContain('rent.rentPerPeriod:too_many_decimals');
  });

  it('keeps options inside the term and notice before exercise', () => {
    const f = valid();
    f.options = [
      { kind: 'BREAK', exerciseOn: '2029-01-01', noticeBy: '2029-02-01', termMonths: '', price: '', reasonablyCertain: false, terms: '' },
      { kind: 'BREAK', exerciseOn: '2033-01-01', noticeBy: '2032-06-01', termMonths: '', price: '', reasonablyCertain: false, terms: '' },
      { kind: 'RENEWAL', exerciseOn: '2032-01-01', noticeBy: '2031-06-30', termMonths: '60', price: '', reasonablyCertain: false, terms: '' },
    ];
    expect(codes(f)).toEqual(['options.0.noticeBy:notice_after_exercise', 'options.1.exerciseOn:outside_term']);
  });

  it('refuses the short-term exemption when a certain renewal makes the term longer than 12 months', () => {
    const f = valid();
    f.term = { commencementDate: '2026-01-01', expiryDate: '2026-12-31' };
    f.accounting.exemption = 'SHORT_TERM';
    expect(codes(f)).toEqual([]);
    f.options = [{ kind: 'RENEWAL', exerciseOn: '2027-01-01', noticeBy: '2026-10-01', termMonths: '12', price: '', reasonablyCertain: true, terms: '' }];
    expect(codes(f)).toEqual(['accounting.exemption:short_term_too_long']);
  });

  it('requires a classification under ASC 842', () => {
    const f = valid();
    f.accounting.standard = 'ASC842';
    expect(codes(f)).toEqual(['accounting.asc842Class:class_required']);
  });

  it('puts escalation and rent steps inside the term, without duplicates', () => {
    const f = valid();
    f.rent.escalation = { kind: 'FIXED', ratePercent: '5', everyMonths: '12', firstReviewOn: '2026-01-01', indexName: '', capPercent: '', collarPercent: '' };
    f.rent.steps = [{ startsOn: '2028-01-01', rentPerPeriod: '1300000' }, { startsOn: '2028-01-01', rentPerPeriod: '1350000' }];
    expect(codes(f)).toEqual(['rent.escalation.firstReviewOn:outside_term', 'rent.steps.1.startsOn:duplicate_date']);
  });
});
