import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { LeasePageQuery } from './__generated__/LeasePageQuery.graphql';

export const leaseQuery = graphql`
  query LeasePageQuery($id: ID!) {
    node(id: $id) { ... on Lease { reference } }
  }
`;

export const leaseLoader = queryLoader<LeasePageQuery>(leaseQuery, ({ params }) => ({ id: params.leaseId ?? '' }));
