import { describe, expect, it } from 'vitest';
import { addDaysIso, listFilter, parseKeyDates, toKeyDatesParams } from './urlState.ts';

describe('key dates URL state', () => {
  it('round-trips the view and filters, ignoring unknown values', () => {
    const s = parseKeyDates(new URLSearchParams('view=calendar&kind=EXPIRY&kind=NOPE&mine=1&month=2027-02&day=2027-02-14&q=Nairobi'));
    expect(s).toMatchObject({ view: 'calendar', kinds: ['EXPIRY'], mine: true, overdue: false, q: 'Nairobi', month: '2027-02', day: '2027-02-14' });
    expect(parseKeyDates(toKeyDatesParams(s))).toEqual(s);
  });

  it('narrows the list to the next 90 days, or to the day picked in the calendar', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(listFilter(parseKeyDates(new URLSearchParams('view=next90')))).toEqual({ from: today, to: addDaysIso(today, 90) });
    expect(listFilter(parseKeyDates(new URLSearchParams('view=calendar&day=2027-03-01&overdue=1')))).toEqual({ overdue: true, from: '2027-03-01', to: '2027-03-01' });
  });
});
