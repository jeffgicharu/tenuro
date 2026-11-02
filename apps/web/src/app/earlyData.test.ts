import { describe, expect, it } from 'vitest';
import { registerVariables } from '../features/register/registerVariables.ts';
import { requestKey } from './earlyData.ts';

describe('early data request keys', () => {
  it('match whatever the key order, and treat absent and null alike', () => {
    expect(requestKey('q', { b: 1, a: { y: null, x: [1, { d: 2, c: 3 }] } })).toBe(requestKey('q', { a: { x: [1, { c: 3, d: 2 }] }, b: 1, c: undefined }));
    expect(requestKey('q', { first: 20 })).not.toBe(requestKey('q', { first: 100 }));
    expect(requestKey('q', {})).not.toBe(requestKey('r', {}));
  });

  it('ask for the register exactly as its loader does', () => {
    const search = new URLSearchParams('status=ACTIVE&q=Nairobi');
    expect(registerVariables(search, true)).toMatchObject({ first: 20, filter: { status: ['ACTIVE'], search: 'Nairobi' } });
    expect(registerVariables(search, false).first).toBe(100);
  });
});
