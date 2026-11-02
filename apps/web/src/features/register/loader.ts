import { graphql } from 'react-relay';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { queryLoader } from '../../app/relayRoute.ts';
import type { RegisterPageQuery } from './__generated__/RegisterPageQuery.graphql';
import { isPhone, registerVariables } from './registerVariables.ts';

export const registerQuery = graphql`
  query RegisterPageQuery($first: Int = 100, $filter: LeaseFilter, $orderBy: [LeaseOrder!]) {
    viewer {
      canEdit
      isAdmin
      tenant { name nameLocal reportingCurrency }
      ...RegisterGrid_viewer @arguments(first: $first, filter: $filter, orderBy: $orderBy)
      ...SavedViewsBar_viewer
    }
  }
`;

// The first visit loads with the filters in the URL; later filter changes refetch in the page
// (inside a transition), so the loader does not run again for search-only changes.
export const registerLoader = queryLoader<RegisterPageQuery>(registerQuery, ({ request }) => {
  // A phone shows the card list, so its first answer carries only the first few leases: a small
  // response that paints at once. "Load more" fetches the rest.
  const phone = isPhone();
  // On wider screens the data grid's code is fetched now, alongside the data, rather than after.
  if (!phone) void import('./RegisterTable.tsx');
  return registerVariables(new URL(request.url).searchParams, phone) as RegisterPageQuery['variables'];
});

export function registerShouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs): boolean {
  return currentUrl.pathname !== nextUrl.pathname || currentUrl.href === nextUrl.href;
}
