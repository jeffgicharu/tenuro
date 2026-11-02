import { useTransition } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import { CalendarClock } from 'lucide-react';
import type { LeaseKeyDates_lease$key } from './__generated__/LeaseKeyDates_lease.graphql';
import type { LeaseKeyDatesPaginationQuery } from './__generated__/LeaseKeyDatesPaginationQuery.graphql';
import { EmptyNote } from '../../components/DefinitionList.tsx';
import { Initials } from '../../components/Initials.tsx';
import { useFormat } from '../../i18n/format.ts';

export function LeaseKeyDates({ lease: ref }: { lease: LeaseKeyDates_lease$key }) {
  const { data, loadNext, hasNext, isLoadingNext, refetch } = usePaginationFragment<LeaseKeyDatesPaginationQuery, LeaseKeyDates_lease$key>(
    graphql`
      fragment LeaseKeyDates_lease on Lease
      @refetchable(queryName: "LeaseKeyDatesPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 20 }, after: { type: "String" }, includeClosed: { type: "Boolean", defaultValue: false }) {
        keyDates(first: $first, after: $after, includeClosed: $includeClosed) @connection(key: "LeaseKeyDates_keyDates", filters: ["includeClosed"]) {
          totalCount
          edges {
            node { id kind title dueOn daysUntil status owner { displayName initials } }
          }
        }
      }
    `,
    ref,
  );
  const [pending, startTransition] = useTransition();
  const f = useFormat();
  const intl = useIntl();
  const t = useTheme().tokens;
  const rows = data.keyDates.edges.map((e) => e.node);

  return (
    <Box sx={{ opacity: pending ? 0.6 : 1, transition: 'opacity 120ms ease' }}>
      <FormControlLabel
        sx={{ mb: 3 }}
        control={<Switch size="small" onChange={(e) => startTransition(() => { refetch({ includeClosed: e.target.checked }, { fetchPolicy: 'store-or-network' }); })} />}
        label={<Box component="span" sx={{ fontSize: '0.8125rem' }}><FormattedMessage id="lease.keyDates.showClosed" /></Box>}
      />
      {rows.length === 0 ? <EmptyNote><FormattedMessage id="lease.keyDates.none" /></EmptyNote> : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.ruleStrong}` }}>
          {rows.map((k) => {
            const soon = k.status === 'UPCOMING' && k.daysUntil <= 30;
            const closed = k.status !== 'UPCOMING';
            return (
              <Box
                component="li"
                key={k.id}
                sx={{
                  display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '120px 1fr auto' }, alignItems: 'center', gap: 4,
                  py: 3, borderBottom: `1px solid ${t.rule}`, color: closed ? t.inkSecondary : t.ink,
                }}
              >
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                  <Box sx={{ fontWeight: 600, fontSize: '0.875rem' }} data-num>{f.date(k.dueOn)}</Box>
                  <Box sx={{ fontSize: '0.75rem', color: soon ? t.warning : t.inkSecondary, fontWeight: soon ? 600 : 400 }}>{f.relativeDays(k.daysUntil)}</Box>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 500, fontSize: '0.875rem' }}>
                    <CalendarClock size={15} strokeWidth={1.7} aria-hidden style={{ flexShrink: 0, color: soon ? t.warning : t.inkTertiary }} />
                    {intl.formatMessage({ id: `keyDate.${k.kind}` })}
                  </Box>
                  <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, display: { sm: 'none' } }} data-num>{f.date(k.dueOn)} · {f.relativeDays(k.daysUntil)}</Box>
                  {closed && <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary }}><FormattedMessage id={`lease.keyDates.status.${k.status}`} /></Box>}
                </Box>
                {k.owner && <Initials text={k.owner.initials} size={28} title={k.owner.displayName} />}
              </Box>
            );
          })}
        </Box>
      )}
      {hasNext && (
        <Button sx={{ mt: 4 }} variant="outlined" loading={isLoadingNext} onClick={() => startTransition(() => { loadNext(20); })}>
          <FormattedMessage id="common.loadMore" />
        </Button>
      )}
    </Box>
  );
}
