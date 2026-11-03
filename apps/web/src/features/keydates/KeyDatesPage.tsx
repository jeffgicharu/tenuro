import { lazy, Suspense, useCallback, useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useRevalidator, useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CalendarDays, CalendarRange, List } from 'lucide-react';
import type { KeyDatesPageQuery } from './__generated__/KeyDatesPageQuery.graphql';
import { keyDatesQuery } from './loader.ts';
import { KeyDateList } from './KeyDateList.tsx';
import { KeyDateReminders } from './KeyDateReminders.tsx';
import { KINDS, kindColour, listFilter, parseKeyDates, toKeyDatesParams, type KeyDatesState, type KeyDatesView } from './urlState.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';
import { SearchField } from '../../components/SearchField.tsx';

// The calendar view loads when chosen; the list is the default.
const KeyDateCalendar = lazy(async () => ({ default: (await import('./KeyDateCalendar.tsx')).KeyDateCalendar }));

// Every notice, review, expiry and return across the portfolio: as a list, on a calendar, or the
// next 90 days. Filters and the view live in the URL.
export function KeyDatesPage() {
  const intl = useIntl();
  const revalidator = useRevalidator();
  return (
    <Box sx={{ px: { xs: 4, md: 8 }, pt: { xs: 5, md: 7 }, pb: 10, maxWidth: 1480 }}>
      <ErrorBoundary
        onRetry={() => void revalidator.revalidate()}
        fallback={(retry) => (
          <EmptyState role="alert" title={intl.formatMessage({ id: 'keyDates.error.title' })} body={intl.formatMessage({ id: 'dashboard.error.body' })}
            action={<Button variant="contained" onClick={retry}><FormattedMessage id="common.retry" /></Button>} />
        )}
      >
        <Suspense fallback={<><Typography variant="h1"><FormattedMessage id="keyDates.title" /></Typography><Skeleton variant="rounded" height={420} sx={{ mt: 6 }} /></>}>
          <KeyDatesContent />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
}

function KeyDatesContent() {
  const { viewer } = useRouteQuery<KeyDatesPageQuery>(keyDatesQuery);
  const intl = useIntl();
  const t = useTheme().tokens;
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseKeyDates(params), [params]);
  const set = useCallback((patch: Partial<KeyDatesState>) => setParams(toKeyDatesParams({ ...state, ...patch }), { replace: true }), [setParams, state]);
  const filter = useMemo(() => listFilter(state), [state]);
  if (!viewer) return null;

  const toggleKind = (k: (typeof KINDS)[number]) => set({ kinds: state.kinds.includes(k) ? state.kinds.filter((x) => x !== k) : [...state.kinds, k] });

  return (
    <>
      <Box component="header" sx={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: 4, mb: 5 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h1"><FormattedMessage id="keyDates.title" /></Typography>
          <Box sx={{ mt: 1, fontSize: '0.875rem', color: t.inkSecondary }}><FormattedMessage id="keyDates.lede" /></Box>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={state.view} onChange={(_e, v: KeyDatesView | null) => v && set({ view: v, day: null })} aria-label={intl.formatMessage({ id: 'keyDates.view' })}>
          <ToggleButton value="list" sx={{ gap: 1, px: 2.5, textTransform: 'none' }}><List size={15} aria-hidden /><FormattedMessage id="keyDates.view.list" /></ToggleButton>
          <ToggleButton value="calendar" sx={{ gap: 1, px: 2.5, textTransform: 'none' }}><CalendarDays size={15} aria-hidden /><FormattedMessage id="keyDates.view.calendar" /></ToggleButton>
          <ToggleButton value="next90" sx={{ gap: 1, px: 2.5, textTransform: 'none' }}><CalendarRange size={15} aria-hidden /><FormattedMessage id="keyDates.view.next90" /></ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 5 }}>
        <SearchField value={state.q} onChange={(v) => set({ q: v })} label={intl.formatMessage({ id: 'keyDates.search' })} placeholder={intl.formatMessage({ id: 'keyDates.searchPlaceholder' })} clearLabel={intl.formatMessage({ id: 'common.clear' })} width={280} />
        <Box role="group" aria-label={intl.formatMessage({ id: 'keyDates.kinds' })} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {KINDS.map((k) => {
            const on = state.kinds.includes(k);
            return (
              <Button key={k} size="small" variant={on ? 'contained' : 'outlined'} aria-pressed={on} onClick={() => toggleKind(k)}
                sx={{ borderRadius: 4, textTransform: 'none', gap: 1, ...(on ? {} : { color: t.ink, borderColor: t.ruleStrong }) }}>
                <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: on ? 'currentColor' : kindColour(t.mode, k) }} />
                <FormattedMessage id={`keyDate.${k}`} />
              </Button>
            );
          })}
        </Box>
        <Button size="small" variant={state.overdue ? 'contained' : 'outlined'} color={state.overdue ? 'error' : 'inherit'} aria-pressed={state.overdue} onClick={() => set({ overdue: !state.overdue })} sx={{ borderRadius: 4, textTransform: 'none' }}>
          <FormattedMessage id="keyDates.overdueOnly" />
        </Button>
        <Button size="small" variant={state.mine ? 'contained' : 'outlined'} color="inherit" aria-pressed={state.mine} onClick={() => set({ mine: !state.mine })} sx={{ borderRadius: 4, textTransform: 'none' }}>
          <FormattedMessage id="keyDates.mine" />
        </Button>
      </Box>

      {state.view === 'calendar' ? (
        // The calendar beside the picked day's dates, so nothing needs scrolling; reminders below them.
        <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 380px' }, alignItems: 'start' }}>
          <Suspense fallback={<Skeleton variant="rounded" height={520} />}>
            <KeyDateCalendar month={state.month} day={state.day} filter={filter} onMonth={(m) => set({ month: m, day: null })} onDay={(d) => set({ day: d })} />
          </Suspense>
          <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <Box component="section" aria-labelledby="day-panel" sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: 4 }}>
              <Box component="h2" id="day-panel" sx={{ m: 0, mb: 3, fontSize: '0.9375rem', fontWeight: 600 }}>
                {state.day ? intl.formatDate(`${state.day}T00:00:00Z`, { dateStyle: 'full', timeZone: 'UTC' }) : <FormattedMessage id="keyDates.dayPanel" />}
              </Box>
              {!state.day && <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="keyDates.pickDay" /></Box>}
              {/* Kept mounted (hidden until a day is picked) so it refetches whenever the filter changes. */}
              <Box hidden={!state.day} sx={{ maxHeight: 560, overflowY: 'auto' }}>
                <KeyDateList viewer={viewer} filter={filter} canEdit={viewer.canEdit} compact />
              </Box>
            </Box>
            <KeyDateReminders viewer={viewer} />
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 300px' }, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>
            <KeyDateList viewer={viewer} filter={filter} canEdit={viewer.canEdit} />
          </Box>
          <KeyDateReminders viewer={viewer} />
        </Box>
      )}
    </>
  );
}
