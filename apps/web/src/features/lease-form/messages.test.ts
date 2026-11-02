import { describe, expect, it } from 'vitest';
import { createIntl } from 'react-intl';
import { leaseFormAr, leaseFormEn, leaseFormSw } from './messages.ts';
import { en } from '../../i18n/messages/en.ts';

describe('lease form messages', () => {
  it('reads naturally with the payment period filled in', () => {
    const intl = createIntl({ locale: 'en-GB', messages: { ...en, ...leaseFormEn } });
    const help = intl.formatMessage({ id: 'leaseForm.field.rent.rentPerPeriod.help' }, { period: en['frequency.perPeriod.QUARTERLY'] });
    expect(help).toBe('The rent due per quarter at commencement, before any increases.');
  });

  it('has every key in Arabic and Swahili, and every message formats', () => {
    for (const [locale, catalogue] of [['ar-AE', leaseFormAr], ['sw-KE', leaseFormSw]] as const) {
      expect(Object.keys(catalogue).sort()).toEqual(Object.keys(leaseFormEn).sort());
      const errors: string[] = [];
      const intl = createIntl({ locale, messages: catalogue, onError: (e) => errors.push(String(e)) });
      for (const id of Object.keys(catalogue)) {
        intl.formatMessage({ id }, { count: 2, months: 3, places: 0, period: 'x', step: 'x', reference: 'x', section: 'x', role: 'x', n: 1, time: 'x', when: 'x', current: 1, total: 8, max: 5, min: 1, other: 'x' });
      }
      expect(errors).toEqual([]);
    }
  });
});
