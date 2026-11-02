import { describe, expect, it } from 'vitest';
import { validLease } from './test-fixtures.ts';
import { annualRentAtStart, diffForms, fieldId, firstYearPayments, formToInput, labelKey, normaliseForm, setAt, stepOfPath } from './model.ts';

describe('paths', () => {
  it('updates nested values without touching the original', () => {
    const f = validLease();
    const next = setAt(f, 'options.0.exerciseOn', '2029-01-01');
    expect(next.options[0]!.exerciseOn).toBe('2029-01-01');
    expect(f.options[0]!.exerciseOn).not.toBe('2029-01-01');
    expect(next.rent).toBe(f.rent);
  });

  it('derives stable ids, label keys and steps from paths', () => {
    expect(fieldId('options.2.exerciseOn')).toBe('lf-options-2-exerciseOn');
    expect(labelKey('options.2.exerciseOn')).toBe('leaseForm.field.options.exerciseOn');
    expect(stepOfPath('rent.steps.1.startsOn')).toBe('rent');
    expect(stepOfPath('notes')).toBe('review');
  });
});

describe('formToInput', () => {
  it('sends optional blanks as null and keeps numbers as exact strings', () => {
    const f = validLease();
    f.rent.rentPerPeriod = '1250000.50';
    f.rent.serviceChargePerPeriod = '';
    const input = formToInput(f);
    expect(input.rentPerPeriod).toBe('1250000.50');
    expect(input.serviceChargePerPeriod).toBeNull();
    expect(input.escalation).toMatchObject({ kind: 'FIXED', ratePercent: '5', everyMonths: 12, indexName: null });
    expect(input.options[0]).toMatchObject({ kind: 'BREAK', termMonths: null, price: null });
    expect(input.accounting.asc842Class).toBeNull();
  });

  it('omits the escalation entirely when the rent does not change', () => {
    const f = validLease();
    f.rent.escalation.kind = 'NONE';
    expect(formToInput(f).escalation).toBeNull();
  });
});

describe('diffForms', () => {
  it('lists only real changes, treating equal decimals as equal', () => {
    const before = validLease();
    const after = structuredClone(before);
    after.rent.rentPerPeriod = '1250000.00';
    expect(diffForms(before, after)).toEqual([]);
    after.rent.rentPerPeriod = '1300000';
    after.notes = 'Agreed at review';
    expect(diffForms(before, after).map((c) => c.path).sort()).toEqual(['notes', 'rent.rentPerPeriod']);
  });
});

describe('normaliseForm', () => {
  it('fills fields missing from an older draft', () => {
    const f = normaliseForm({ parties: { landlord: { name: 'X' } }, rent: { currency: 'EUR' } }, validLease());
    expect(f.rent.currency).toBe('EUR');
    expect(f.rent.escalation.kind).toBe('FIXED');
    expect(f.options).toEqual([]);
  });
});

describe('rent preview', () => {
  it('annualises the rent and lists first-year payments', () => {
    const f = validLease();
    expect(annualRentAtStart(f)).toBe('5000000.00');
    const payments = firstYearPayments(f);
    expect(payments).toHaveLength(4);
    expect(payments.map((p) => p.dueOn)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
    expect(payments.every((p) => p.amount === '1250000.00')).toBe(true);
  });

  it('applies a fixed uplift once its first review date is reached', () => {
    const f = validLease();
    f.rent.escalation.firstReviewOn = '2026-07-01';
    expect(firstYearPayments(f).map((p) => p.amount)).toEqual(['1250000.00', '1250000.00', '1312500.00', '1312500.00']);
  });
});
