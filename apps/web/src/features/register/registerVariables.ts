import { parseState, toGraphQLFilter } from './urlState.ts';

// MUI's md breakpoint (900px), below which the register is a card list.
export const PHONE_QUERY = '(max-width: 899.95px)';
export const PHONE_FIRST = 20;

export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;

// The register's first query, from its URL. Shared by the route loader and the early data request
// (app/earlyData.ts), so both ask for exactly the same thing.
export function registerVariables(search: URLSearchParams, phone: boolean) {
  const state = parseState(search);
  return { first: phone ? PHONE_FIRST : 100, filter: toGraphQLFilter(state.filter), orderBy: state.orderBy };
}
