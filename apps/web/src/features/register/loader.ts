import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { RegisterPageQuery } from './__generated__/RegisterPageQuery.graphql';

export const registerQuery = graphql`
  query RegisterPageQuery {
    viewer { leases(first: 1) { totalCount } }
  }
`;

export const registerLoader = queryLoader<RegisterPageQuery>(registerQuery);
