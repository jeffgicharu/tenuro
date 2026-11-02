import { graphql } from 'react-relay';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { queryLoader } from '../../app/relayRoute.ts';
import type { RegisterPageQuery } from './__generated__/RegisterPageQuery.graphql';
import { parseState, toGraphQLFilter } from './urlState.ts';

export const registerQuery = graphql`
  query RegisterPageQuery($filter: LeaseFilter, $orderBy: [LeaseOrder!]) {
    viewer {
      canEdit
      isAdmin
      tenant { name nameLocal reportingCurrency }
      ...RegisterGrid_viewer @arguments(filter: $filter, orderBy: $orderBy)
      ...SavedViewsBar_viewer
    }
  }
`;

// The first visit loads with the filters in the URL; later filter changes refetch in the page
// (inside a transition), so the loader does not run again for search-only changes.
export const registerLoader = queryLoader<RegisterPageQuery>(registerQuery, ({ request }) => {
  const state = parseState(new URL(request.url).searchParams);
  return { filter: toGraphQLFilter(state.filter), orderBy: state.orderBy } as RegisterPageQuery['variables'];
});

export function registerShouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs): boolean {
  return currentUrl.pathname !== nextUrl.pathname || currentUrl.href === nextUrl.href;
}
