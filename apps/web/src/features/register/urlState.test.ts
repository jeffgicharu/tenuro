import { describe, expect, it } from 'vitest';
import { sortModelToOrder } from './columns.tsx';
import { DEFAULT_ORDER, parseState, sanitiseViewFilters, toGraphQLFilter, toParams, type RegisterState } from './urlState.ts';

describe('register URL state', () => {
  it('round-trips every filter, the sort and the view through the URL', () => {
    const state: RegisterState = {
      filter: {
        search: 'Westlands', status: ['ACTIVE', 'HOLDING_OVER'], countryCode: ['KE', 'UG'], city: ['Nairobi', 'دبي'],
        propertyType: ['OFFICE'], currency: ['KES'], expiresWithinDays: 180, expiry: { from: '2027-01-01', to: '2027-12-31' },
        annualRent: { min: '1000000', max: '25000000.50' }, nextKeyWithinDays: 90, nextKeyKind: ['BREAK_NOTICE'], hasOpenBreak: true,
      },
      orderBy: [{ field: 'ANNUAL_RENT', direction: 'DESC' }],
      view: 'U2F2ZWRWaWV3OjE=',
    };
    expect(parseState(toParams(state))).toEqual(state);
  });

  it('uses the default sort and omits it from the URL', () => {
    const p = toParams({ filter: {}, orderBy: DEFAULT_ORDER, view: null });
    expect(p.toString()).toBe('');
    expect(parseState(p).orderBy).toEqual(DEFAULT_ORDER);
  });

  it('drops malformed or unknown values from a hand-edited URL', () => {
    const s = parseState(new URLSearchParams('status=ACTIVE&status=BOGUS&country=kenya&country=KE&expIn=-5&rentMin=12abc&expFrom=2027-13-01x&sort=DROP_TABLE.asc&keyIn=999999'));
    expect(s.filter).toEqual({ status: ['ACTIVE'], countryCode: ['KE'] });
    expect(s.orderBy).toEqual(DEFAULT_ORDER);
  });

  it('sends no filter at all when nothing is set', () => {
    expect(toGraphQLFilter({})).toBeNull();
    expect(toGraphQLFilter({ hasOpenBreak: true })).toEqual({ hasOpenBreak: true });
  });

  it('cleans a stored view before applying it', () => {
    const clean = sanitiseViewFilters(
      { status: ['ACTIVE', 'NOPE' as never], expiresWithinDays: 365 },
      [{ field: 'NOT_A_FIELD' as never, direction: 'ASC' }],
    );
    expect(clean).toEqual({ filter: { status: ['ACTIVE'], expiresWithinDays: 365 }, orderBy: DEFAULT_ORDER });
  });
});

describe('grid sort mapping', () => {
  it('maps a grid column sort to the server order field', () => {
    expect(sortModelToOrder([{ field: 'annualRentReporting', sort: 'desc' }])).toEqual([{ field: 'ANNUAL_RENT', direction: 'DESC' }]);
    expect(sortModelToOrder([{ field: 'expiryDate', sort: 'asc' }])).toEqual([{ field: 'EXPIRY_DATE', direction: 'ASC' }]);
  });

  it('falls back to the default order when the sort is cleared or the column cannot sort', () => {
    expect(sortModelToOrder([])).toEqual(DEFAULT_ORDER);
    expect(sortModelToOrder([{ field: 'premises', sort: 'asc' }])).toEqual(DEFAULT_ORDER);
    expect(sortModelToOrder([{ field: 'expiryDate', sort: null }])).toEqual(DEFAULT_ORDER);
  });
});
