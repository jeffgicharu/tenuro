import { useState, useTransition } from 'react';
import { graphql, useFragment, usePaginationFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import type { LeaseActivity_lease$key } from './__generated__/LeaseActivity_lease.graphql';
import type { LeaseActivityPaginationQuery } from './__generated__/LeaseActivityPaginationQuery.graphql';
import type { LeaseActivityItem_activity$key } from './__generated__/LeaseActivityItem_activity.graphql';
import { EmptyNote } from '../../components/DefinitionList.tsx';
import { Initials } from '../../components/Initials.tsx';
import { useFormat } from '../../i18n/format.ts';

interface Change {
  field: string;
  from: string;
  to: string;
}

// Turns a form path like "rent.escalation.ratePercent" into a readable label without needing a
// message for every nested path: the last meaningful segment, split into words.
function fieldLabel(path: string): string {
  const parts = path.split('.').filter((p) => !/^\d+$/.test(p));
  const last = parts.at(-1) ?? path;
  const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Percent$/i, ' %').toLowerCase();
  const scope = parts.length > 1 ? parts[0] : '';
  return scope && !words.includes(scope) ? `${scope} · ${words}` : words;
}

function ActivityItem({ activity: ref }: { activity: LeaseActivityItem_activity$key }) {
  const a = useFragment(
    graphql`
      fragment LeaseActivityItem_activity on Activity {
        id verb summary diff createdAt
        actor { displayName initials }
      }
    `,
    ref,
  );
  const [open, setOpen] = useState(false);
  const f = useFormat();
  const intl = useIntl();
  const t = useTheme().tokens;
  const changes: Change[] = a.diff ? (JSON.parse(a.diff) as Change | Change[] extends infer T ? T : never) as unknown as Change[] : [];
  const list = Array.isArray(changes) ? changes : [changes as unknown as Change];

  return (
    <Box component="li" sx={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 3, py: 3, position: 'relative' }}>
      <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {a.actor ? <Initials text={a.actor.initials} size={28} title={a.actor.displayName} /> : (
          <Box sx={{ width: 10, height: 10, mt: 1.5, borderRadius: '50%', border: `2px solid ${t.ruleStrong}`, backgroundColor: t.surface }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: '0.875rem' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>{a.actor?.displayName ?? intl.formatMessage({ id: 'lease.activity.system' })}</Box>{' '}
          <Box component="span" sx={{ color: t.inkSecondary }}>{a.summary}</Box>
        </Box>
        <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary, mt: 0.5 }} data-num>{f.dateTime(a.createdAt)}</Box>
        {list.length > 0 && (
          <>
            <Button size="small" variant="text" onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ mt: 1, px: 1, minHeight: 26, color: t.brand }}>
              {open ? <FormattedMessage id="lease.activity.hideChanges" /> : <FormattedMessage id="lease.activity.changes" values={{ count: list.length }} />}
            </Button>
            {open && (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface }}>
                {list.map((c, i) => (
                  <Box component="li" key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '180px minmax(0, 1fr)' }, gap: 2, px: 3, py: 2, borderTop: i ? `1px solid ${t.rule}` : 0, fontSize: '0.8125rem' }}>
                    <Box sx={{ color: t.inkSecondary }}>{fieldLabel(c.field)}</Box>
                    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }} data-num>
                      <Box component="del" sx={{ color: t.danger, textDecorationColor: t.danger }}><bdi>{c.from || '—'}</bdi></Box>
                      {' → '}
                      <Box component="ins" sx={{ color: t.success, textDecoration: 'none', fontWeight: 600 }}><bdi>{c.to || '—'}</bdi></Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

export function LeaseActivity({ lease: ref }: { lease: LeaseActivity_lease$key }) {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<LeaseActivityPaginationQuery, LeaseActivity_lease$key>(
    graphql`
      fragment LeaseActivity_lease on Lease
      @refetchable(queryName: "LeaseActivityPaginationQuery")
      @argumentDefinitions(first: { type: "Int", defaultValue: 15 }, after: { type: "String" }) {
        activity(first: $first, after: $after) @connection(key: "LeaseActivity_activity") {
          edges { node { id ...LeaseActivityItem_activity } }
        }
      }
    `,
    ref,
  );
  const [, startTransition] = useTransition();
  const t = useTheme().tokens;
  const rows = data.activity.edges;
  if (rows.length === 0) return <EmptyNote><FormattedMessage id="lease.activity.none" /></EmptyNote>;
  return (
    <Box>
      <Box
        component="ol"
        sx={{
          listStyle: 'none', m: 0, p: 0, position: 'relative',
          '&::before': { content: '""', position: 'absolute', insetInlineStart: 15.5, top: 20, bottom: 20, width: '1px', backgroundColor: t.rule },
        }}
      >
        {rows.map((e) => <ActivityItem key={e.node.id} activity={e.node} />)}
      </Box>
      {hasNext && (
        <Button sx={{ mt: 2 }} variant="outlined" loading={isLoadingNext} onClick={() => startTransition(() => { loadNext(20); })}>
          <FormattedMessage id="common.loadMore" />
        </Button>
      )}
    </Box>
  );
}
