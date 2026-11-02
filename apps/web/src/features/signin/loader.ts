import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { SignInPageQuery } from './__generated__/SignInPageQuery.graphql';

export const signInQuery = graphql`
  query SignInPageQuery {
    signInAccounts {
      id
      displayName
      jobTitle
      role
      tenant { id name nameLocal languages leaseCount countries theme { mark } }
    }
  }
`;

export const signInLoader = queryLoader<SignInPageQuery>(signInQuery);
