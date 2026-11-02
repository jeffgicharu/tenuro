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
        rollForward { opening { amount currency } additions { amount currency } interest { amount currency } payments { amount currency } remeasurements { amount currency } fx { amount currency } closing { amount currency } }
        monthly { month interest { amount currency } depreciation { amount currency } leaseCost { amount currency } }
        largest { reference propertyName city lease { id } liability { amount currency } liabilityLocal { amount currency } }
        byCountry { countryCode leases liability { amount currency } }
      }
    }
  }
`;

export const accountingLoader = queryLoader<AccountingPageQuery>(accountingQuery);
