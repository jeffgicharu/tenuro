import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { KeyDatesPageQuery } from './__generated__/KeyDatesPageQuery.graphql';
import { listFilter, parseKeyDates } from './urlState.ts';

export const keyDatesQuery = graphql`
  query KeyDatesPageQuery($filter: KeyDateFilter) {
    viewer {
      canEdit
      ...KeyDateList_viewer @arguments(filter: $filter)
      ...KeyDateReminders_viewer
    }
  }
`;

export const keyDatesLoader = queryLoader<KeyDatesPageQuery>(keyDatesQuery, ({ request }) => ({
  filter: listFilter(parseKeyDates(new URL(request.url).searchParams)),
} as KeyDatesPageQuery['variables']));

// Filter and view changes refetch inside the page; only a new visit runs the loader again.
export function keyDatesShouldRevalidate({ currentUrl, nextUrl }: { currentUrl: URL; nextUrl: URL }): boolean {
  return currentUrl.pathname !== nextUrl.pathname;
}
