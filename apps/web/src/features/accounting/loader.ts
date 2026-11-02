import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { AccountingPageQuery } from './__generated__/AccountingPageQuery.graphql';

export const accountingQuery = graphql`
  query AccountingPageQuery {
    viewer {
      tenant { name nameLocal reportingCurrency }
      accountingSummary {
        year leasesMeasured leasesUnmeasured
        liability { amount currency } rou { amount currency } currentLiability { amount currency }
        interestThisYear { amount currency } depreciationThisYear { amount currency } leaseCostThisYear { amount currency } cashThisYear { amount currency }
        maturity { key amount { amount currency } }
        byCurrency { leases liability { amount currency } }
        byStandard { standard leases }
      }
    }
  }
`;

export const accountingLoader = queryLoader<AccountingPageQuery>(accountingQuery);
