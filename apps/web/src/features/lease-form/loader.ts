import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { LeaseFormPageQuery } from './__generated__/LeaseFormPageQuery.graphql';

export const leaseFormQuery = graphql`
  query LeaseFormPageQuery($leaseId: ID!, $draftId: ID!, $isAmend: Boolean!, $hasDraft: Boolean!) {
    viewer {
      canEdit
      newLeaseTemplate
      ...PropertyPicker_viewer
      ...LeaseDrafts_viewer
    }
    lease: node(id: $leaseId) @include(if: $isAmend) {
      ... on Lease { id reference version formData }
    }
    draft: node(id: $draftId) @include(if: $hasDraft) {
      ... on LeaseDraft {
        id
        data
        currentStep
        version
        updatedAt
        lease { id reference version formData }
      }
    }
  }
`;

// Always fetched fresh: an amendment must start from the current version, and a draft from its
// latest save.
export const leaseFormLoader = queryLoader<LeaseFormPageQuery>(
  leaseFormQuery,
  ({ params, request }) => {
    const draftId = new URL(request.url).searchParams.get('draft') ?? '';
    const leaseId = params.leaseId ?? '';
    return { leaseId, draftId, isAmend: leaseId !== '', hasDraft: draftId !== '' };
  },
  'network-only',
);
