import { Suspense } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useRevalidator } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { DashboardPageQuery } from './__generated__/DashboardPageQuery.graphql';
import { dashboardQuery } from './loader.ts';
import { CriticalDates } from './CriticalDates.tsx';
import { ExpiryProfile } from './ExpiryProfile.tsx';
import { PortfolioFigures } from './PortfolioFigures.tsx';
import { RecentActivity } from './RecentActivity.tsx';
import { RentMix } from './RentMix.tsx';
import { NeedsAttention } from './NeedsAttention.tsx';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';
import { useFormat } from '../../i18n/format.ts';

// Home after sign-in: the portfolio in the first ten seconds. Figures across the top, then where
// the rent falls due and where it sits, then what needs doing and what changed.
export function DashboardPage() {
  const intl = useIntl();
  const revalidator = useRevalidator();
  return (
    <Box sx={{ px: { xs: 4, md: 8 }, pt: { xs: 5, md: 7 }, pb: 10, maxWidth: 1480 }}>
      <ErrorBoundary
        onRetry={() => void revalidator.revalidate()}
        fallback={(retry) => (
          <EmptyState
            role="alert"
            title={intl.formatMessage({ id: 'dashboard.error.title' })}
            body={intl.formatMessage({ id: 'dashboard.error.body' })}
            action={<Button variant="contained" onClick={retry}><FormattedMessage id="common.retry" /></Button>}
          />
        )}
      >
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
}

function Header({ company }: { company?: string }) {
  const f = useFormat();
  const t = useTheme().tokens;
  return (
    <Box component="header" sx={{ mb: { xs: 4, md: 6 } }}>
      <Typography variant="h1"><FormattedMessage id="dashboard.title" /></Typography>
      <Box sx={{ mt: 1, fontSize: '0.875rem', color: t.inkSecondary, minHeight: 21 }}>
        {company && <FormattedMessage id="dashboard.asAt" values={{ company, date: f.date(new Date().toISOString().slice(0, 10), 'long') }} />}
      </Box>
    </Box>
  );
}

function DashboardContent() {
  const { viewer } = useRouteQuery<DashboardPageQuery>(dashboardQuery);
  const intl = useIntl();
  const t = useTheme().tokens;
  if (!viewer) return null;
  const company = intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name;
  return (
    <>
      <Header company={company} />
      <Box sx={{ borderTop: `2px solid ${t.ink}`, borderBottom: `1px solid ${t.rule}`, mb: { xs: 5, md: 7 } }}>
        <PortfolioFigures portfolio={viewer.portfolio} />
      </Box>
      <Box sx={{ mb: { xs: 4, md: 5 } }}>
        <NeedsAttention portfolio={viewer.portfolio} canEdit={viewer.canEdit} userId={viewer.user.id} />
      </Box>
      <Box sx={{ display: 'grid', gap: { xs: 4, md: 5 }, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.7fr) minmax(0, 1fr)' }, mb: { xs: 4, md: 5 } }}>
        <ExpiryProfile portfolio={viewer.portfolio} />
        <RentMix portfolio={viewer.portfolio} />
      </Box>
      <Box sx={{ display: 'grid', gap: { xs: 4, md: 5 }, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.25fr) minmax(0, 1fr)' } }}>
        <CriticalDates portfolio={viewer.portfolio} />
        <RecentActivity portfolio={viewer.portfolio} />
      </Box>
    </>
  );
}

// Shaped like the page it stands in for, so nothing jumps when the figures arrive.
function DashboardSkeleton() {
  const t = useTheme().tokens;
  const panel = (height: number) => (
    <Box sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, p: { xs: 4, md: 6 }, backgroundColor: t.surface }}>
      <Skeleton width="40%" height={28} />
      <Skeleton variant="rounded" height={height} sx={{ mt: 3 }} />
    </Box>
  );
  return (
    <Box aria-busy="true">
      <Header />
      <Box sx={{ borderTop: `2px solid ${t.ink}`, borderBottom: `1px solid ${t.rule}`, mb: { xs: 5, md: 7 }, py: 5, display: 'grid', gap: 4, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: '1.5fr repeat(4, 1fr)' } }}>
        {[0, 1, 2, 3, 4].map((i) => <Box key={i}><Skeleton width="60%" /><Skeleton width="80%" height={44} /><Skeleton width="50%" /></Box>)}
      </Box>
      <Box sx={{ mb: 5 }}>{panel(300)}</Box>
      <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr', lg: '1.7fr 1fr' }, mb: 5 }}>{panel(260)}{panel(260)}</Box>
      <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr', lg: '1.25fr 1fr' } }}>{panel(320)}{panel(320)}</Box>
    </Box>
  );
}
