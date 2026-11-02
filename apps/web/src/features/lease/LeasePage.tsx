import { Suspense, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useTheme } from '@mui/material/styles';
import type { LeasePageQuery } from './__generated__/LeasePageQuery.graphql';
import { leaseQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { NotFound } from '../../shell/NotFound.tsx';
import { LeaseHeader } from './LeaseHeader.tsx';
import { LeaseFigures } from './LeaseFigures.tsx';
import { LeaseOverview } from './LeaseOverview.tsx';
import { LeaseRentSchedule } from './LeaseRentSchedule.tsx';
import { LeaseKeyDates } from './LeaseKeyDates.tsx';
import { LeaseDocuments } from './LeaseDocuments.tsx';
import { LeaseTasks } from './LeaseTasks.tsx';
import { LeaseActivity } from './LeaseActivity.tsx';
import { LeaseRail } from './LeaseRail.tsx';

const TABS = ['overview', 'schedule', 'key-dates', 'documents', 'tasks', 'activity'] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABEL: Record<TabKey, string> = {
  overview: 'lease.tab.overview', schedule: 'lease.tab.schedule', 'key-dates': 'lease.tab.keyDates',
  documents: 'lease.tab.documents', tasks: 'lease.tab.tasks', activity: 'lease.tab.activity',
};

export function LeasePage() {
  const data = useRouteQuery<LeasePageQuery>(leaseQuery);
  const intl = useIntl();
  const t = useTheme().tokens;
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.replace('#', '') as TabKey;
  const [tab, setTab] = useState<TabKey>(TABS.includes(hash) ? hash : 'overview');

  useEffect(() => {
    if (TABS.includes(hash) && hash !== tab) setTab(hash);
  }, [hash, tab]);

  const lease = data.node?.lease ?? null;

  useEffect(() => {
    if (lease) document.title = `${lease.reference} · Tenuro`;
    return () => { document.title = 'Tenuro'; };
  }, [lease]);

  if (!lease) return <NotFound />;

  const canEdit = data.viewer?.canEdit ?? false;
  const selectTab = (next: TabKey) => {
    setTab(next);
    void navigate({ hash: next === 'overview' ? '' : next }, { replace: true, preventScrollReset: true });
  };

  return (
    <Box sx={{ px: { xs: 4, md: 8, xl: 12 }, py: { xs: 5, md: 8 }, maxWidth: 1480, mx: 'auto' }}>
      <LeaseHeader lease={lease} canEdit={canEdit} onAddTask={() => selectTab('tasks')} />
      <LeaseFigures lease={lease} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 320px' }, gap: { xs: 6, xl: 10 }, mt: 8 }}>
        <Box sx={{ minWidth: 0 }}>
          <Tabs
            value={tab}
            onChange={(_e, v: TabKey) => selectTab(v)}
            variant="scrollable"
            scrollButtons={false}
            aria-label={intl.formatMessage({ id: 'lease.tabs' })}
          >
            {TABS.map((key) => (
              <Tab key={key} value={key} id={`lease-tab-${key}`} aria-controls={`lease-panel-${key}`} label={<FormattedMessage id={TAB_LABEL[key]} />} />
            ))}
          </Tabs>
          <Box role="tabpanel" id={`lease-panel-${tab}`} aria-labelledby={`lease-tab-${tab}`} sx={{ pt: 6 }}>
            <Suspense fallback={<Box sx={{ display: 'grid', gap: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={32} />)}</Box>}>
              {tab === 'overview' && <LeaseOverview lease={lease} />}
              {tab === 'schedule' && <LeaseRentSchedule lease={lease} />}
              {tab === 'key-dates' && <LeaseKeyDates lease={lease} />}
              {tab === 'documents' && <LeaseDocuments lease={lease} />}
              {tab === 'tasks' && <LeaseTasks lease={lease} canEdit={canEdit} />}
              {tab === 'activity' && <LeaseActivity lease={lease} />}
            </Suspense>
          </Box>
        </Box>
        <Box component="aside" aria-label={intl.formatMessage({ id: 'lease.rail.title' })} sx={{ display: { xs: 'none', xl: 'block' }, borderInlineStart: `1px solid ${t.rule}`, paddingInlineStart: 8 }}>
          <LeaseRail lease={lease} onOpen={selectTab} />
        </Box>
      </Box>
    </Box>
  );
}
