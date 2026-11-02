import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { LeaseFormPageQuery } from './__generated__/LeaseFormPageQuery.graphql';

export const leaseFormQuery = graphql`
  query LeaseFormPageQuery {
    viewer { newLeaseTemplate }
  }
`;

export const leaseFormLoader = queryLoader<LeaseFormPageQuery>(leaseFormQuery);
