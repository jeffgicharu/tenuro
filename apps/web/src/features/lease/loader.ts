import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { LeasePageQuery } from './__generated__/LeasePageQuery.graphql';

export const leaseQuery = graphql`
  query LeasePageQuery($id: ID!) {
    viewer { canEdit }
    node(id: $id) {
      ... on Lease @alias(as: "lease") {
        id
        reference
        ...LeaseHeader_lease
        ...LeaseFigures_lease
        ...LeaseOverview_lease
        ...LeaseRentSchedule_lease
        ...LeaseKeyDates_lease
        ...LeaseDocuments_lease
        ...LeaseTasks_lease
        ...LeaseActivity_lease
        ...LeaseRail_lease
      }
    }
  }
`;

export const leaseLoader = queryLoader<LeasePageQuery>(leaseQuery, ({ params }) => ({ id: params.leaseId ?? '' }), 'store-and-network');
