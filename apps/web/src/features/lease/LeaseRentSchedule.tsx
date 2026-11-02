import { useTransition } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import type { LeaseRentSchedule_lease$key } from './__generated__/LeaseRentSchedule_lease.graphql';
import type { LeaseRentSchedulePaginationQuery } from './__generated__/LeaseRentSchedulePaginationQuery.graphql';
import { useFormat } from '../../i18n/format.ts';

export function LeaseRentSchedule({ lease: ref }: { lease: LeaseRentSchedule_lease$key }) {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<LeaseRentSchedulePaginationQuery, LeaseRentSchedule_lease$key>(
    graphql`
      fragment LeaseRentSchedule_lease on Lease
      @refetchable(queryName: "LeaseRentSchedulePaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 40 }, after: { type: "String" }) {
        rentSchedule(first: $first, after: $after) @connection(key: "LeaseRentSchedule_rentSchedule") {
          totalCount
          edges {
            node { index start end dueOn rent { amount currency } change isCurrent }
          }
        }
      }
    `,
    ref,
  );
  const [, startTransition] = useTransition();
  const f = useFormat();
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const rows = data.rentSchedule.edges.map((e) => e.node);
  const cell = { py: 2, px: 3, borderBottom: `1px solid ${t.rule}`, fontSize: '0.875rem' } as const;
  const head = { ...cell, fontWeight: 600, fontSize: '0.75rem', color: t.inkSecondary, textAlign: 'start' as const, backgroundColor: t.sunken, position: 'sticky' as const, top: 0 };

  return (
    <Box>
      <Box sx={{ overflowX: 'auto', border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <Box component="caption" sx={{ captionSide: 'bottom', textAlign: 'start', p: 3, color: t.inkSecondary, fontSize: '0.8125rem' }}>
            <FormattedMessage id="lease.schedule.caption" values={{ count: data.rentSchedule.totalCount }} />
          </Box>
          <thead>
            <tr>
              <Box component="th" scope="col" sx={{ ...head, width: 56 }}><FormattedMessage id="lease.schedule.number" /></Box>
              <Box component="th" scope="col" sx={head}><FormattedMessage id="lease.schedule.period" /></Box>
              <Box component="th" scope="col" sx={head}><FormattedMessage id="lease.schedule.due" /></Box>
              <Box component="th" scope="col" sx={{ ...head, textAlign: 'end' }}><FormattedMessage id="lease.schedule.rent" /></Box>
              <Box component="th" scope="col" sx={{ ...head, width: 160 }}><FormattedMessage id="lease.field.escalation" /></Box>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Box
                component="tr"
                key={p.index}
                aria-current={p.isCurrent ? 'true' : undefined}
                sx={{ backgroundColor: p.isCurrent ? t.brandSoft : undefined }}
              >
                <Box component="td" sx={{ ...cell, color: t.inkTertiary }}>{p.index}</Box>
                <Box component="td" sx={cell}>{f.date(p.start)} – {f.date(p.end)}</Box>
                <Box component="td" sx={cell}>{f.date(p.dueOn)}</Box>
                <Box component="td" sx={{ ...cell, textAlign: 'end', fontWeight: p.change ? 600 : 400 }}><bdi>{f.money(p.rent.amount, p.rent.currency)}</bdi></Box>
                <Box component="td" sx={{ ...cell, fontSize: '0.75rem', color: p.isCurrent ? t.brand : t.inkSecondary, fontWeight: p.isCurrent ? 600 : 400 }}>
                  {p.isCurrent ? intl.formatMessage({ id: 'lease.schedule.current' }) : p.change ? intl.formatMessage({ id: `lease.schedule.change.${p.change}` }) : ''}
                </Box>
              </Box>
            ))}
          </tbody>
        </Box>
      </Box>
      {hasNext && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mt: 4 }}>
          <Button variant="outlined" loading={isLoadingNext} onClick={() => startTransition(() => { loadNext(80); })}>
            <FormattedMessage id="common.loadMore" />
          </Button>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }} data-num>
            <FormattedMessage id="common.showing" values={{ shown: rows.length, total: data.rentSchedule.totalCount }} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
