import { graphql } from 'react-relay';
import { queryLoader } from '../../app/relayRoute.ts';
import type { DashboardPageQuery } from './__generated__/DashboardPageQuery.graphql';

export const dashboardQuery = graphql`
  query DashboardPageQuery {
    viewer {
      canEdit
      user { id }
      tenant { name nameLocal }
      portfolio {
        ...NeedsAttention_portfolio
        ...PortfolioFigures_portfolio
        ...ExpiryProfile_portfolio
        ...RentMix_portfolio
        ...PortfolioMap_portfolio
        ...CriticalDates_portfolio
        ...RecentActivity_portfolio
      }
    }
  }
`;

export const dashboardLoader = queryLoader<DashboardPageQuery>(dashboardQuery);
