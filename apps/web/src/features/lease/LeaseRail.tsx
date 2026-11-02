import type { ReactNode } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import type { LeaseRail_lease$key } from './__generated__/LeaseRail_lease.graphql';
import { useFormat } from '../../i18n/format.ts';

function Block({ title, count, onViewAll, children }: { title: ReactNode; count: number; onViewAll: () => void; children: ReactNode }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <Box component="section" sx={{ mb: 8 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2, pb: 2, borderBottom: `1px solid ${t.ruleStrong}` }}>
        <Box component="h2" sx={{ ...theme.typography.h6, m: 0, color: t.inkSecondary }}>{title}</Box>
        {count > 0 && (
          <Button size="small" variant="text" onClick={onViewAll} sx={{ minHeight: 24, px: 1, color: t.brand }}>
            <FormattedMessage id="lease.rail.viewAll" /> <Box component="span" data-num sx={{ marginInlineStart: 1, color: t.inkTertiary }}>{count}</Box>
          </Button>
        )}
      </Box>
      {children}
    </Box>
  );
}

export function LeaseRail({ lease: ref, onOpen }: { lease: LeaseRail_lease$key; onOpen: (tab: 'key-dates' | 'tasks') => void }) {
  const lease = useFragment(
    graphql`
      fragment LeaseRail_lease on Lease {
        upcoming: keyDates(first: 3) { totalCount edges { node { id kind dueOn daysUntil } } }
        openTasks: tasks(first: 3) { totalCount edges { node { id title dueOn isOverdue } } }
      }
    `,
    ref,
  );
  const f = useFormat();
  const intl = useIntl();
  const t = useTheme().tokens;
  const row = { py: 2, borderBottom: `1px solid ${t.rule}`, fontSize: '0.8125rem' } as const;

  return (
    <Box sx={{ position: 'sticky', top: 24 }}>
      <Block title={<FormattedMessage id="lease.rail.dates" />} count={lease.upcoming.totalCount} onViewAll={() => onOpen('key-dates')}>
        {lease.upcoming.edges.length === 0 ? (
          <Box sx={{ ...row, color: t.inkSecondary, borderBottom: 0 }}><FormattedMessage id="lease.keyDates.none" /></Box>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lease.upcoming.edges.map(({ node: k }) => (
              <Box component="li" key={k.id} sx={row}>
                <Box sx={{ fontWeight: 500 }}>{intl.formatMessage({ id: `keyDate.${k.kind}` })}</Box>
                <Box sx={{ color: k.daysUntil <= 30 ? t.warning : t.inkSecondary, fontWeight: k.daysUntil <= 30 ? 600 : 400 }} data-num>
                  {f.date(k.dueOn)} · {f.relativeDays(k.daysUntil)}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Block>
      <Block title={<FormattedMessage id="lease.rail.tasks" />} count={lease.openTasks.totalCount} onViewAll={() => onOpen('tasks')}>
        {lease.openTasks.edges.length === 0 ? (
          <Box sx={{ ...row, color: t.inkSecondary, borderBottom: 0 }}><FormattedMessage id="lease.tasks.none" /></Box>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lease.openTasks.edges.map(({ node: task }) => (
              <Box component="li" key={task.id} sx={row}>
                <Box sx={{ fontWeight: 500 }}>{task.title}</Box>
                <Box sx={{ color: task.isOverdue ? t.danger : t.inkSecondary, fontWeight: task.isOverdue ? 600 : 400 }} data-num>
                  {task.isOverdue && <><FormattedMessage id="lease.tasks.overdue" /> · </>}
                  {task.dueOn ? f.date(task.dueOn) : <FormattedMessage id="lease.tasks.noDue" />}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Block>
    </Box>
  );
}
