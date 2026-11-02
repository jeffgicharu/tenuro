import { graphql, useFragment } from 'react-relay';
import { FormattedMessage } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { RecentActivity_portfolio$key } from './__generated__/RecentActivity_portfolio.graphql';
import { Initials } from '../../components/Initials.tsx';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import { Panel } from './Panel.tsx';

// The latest changes across the portfolio as a ruled timeline: who, what, and which lease.
export function RecentActivity({ portfolio: ref }: { portfolio: RecentActivity_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment RecentActivity_portfolio on Portfolio {
        recentActivity(first: 7) {
          id summary createdAt
          actor { displayName initials }
          lease { id reference }
        }
      }
    `,
    ref,
  );
  const t = useTheme().tokens;
  const f = useFormat();
  const today = Date.parse(new Date().toISOString().slice(0, 10));

  return (
    <Panel title={<FormattedMessage id="dashboard.activity.title" />} lede={<FormattedMessage id="dashboard.activity.lede" />}>
      {p.recentActivity.length === 0 ? (
        <Box sx={{ py: 6, color: t.inkSecondary, fontSize: '0.875rem' }}><FormattedMessage id="dashboard.activity.empty" /></Box>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
          {p.recentActivity.map((a, i) => {
            const days = Math.round((Date.parse(a.createdAt.slice(0, 10)) - today) / 86_400_000);
            return (
              <Box component="li" key={a.id} sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 3, pb: 3.5, position: 'relative' }}>
                {i < p.recentActivity.length - 1 && (
                  <Box aria-hidden sx={{ position: 'absolute', insetInlineStart: 15.5, top: 34, bottom: 2, width: '1px', backgroundColor: t.rule }} />
                )}
                {a.actor ? <Initials text={a.actor.initials} /> : <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: t.sunken }} />}
                <Box sx={{ minWidth: 0, pt: 0.25 }}>
                  <Box sx={{ fontSize: '0.875rem', lineHeight: 1.45 }}>{a.summary}</Box>
                  <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mt: 0.5, display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
                    {a.actor && <span>{a.actor.displayName}</span>}
                    {a.lease && (
                      <Box
                        component={RouterLink}
                        to={`/leases/${encodeURIComponent(a.lease.id)}`}
                        sx={{ fontFamily: FONT_MONO, color: t.brand, textDecoration: 'none', direction: 'ltr', unicodeBidi: 'isolate', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {a.lease.reference}
                      </Box>
                    )}
                    <Box component="time" dateTime={a.createdAt} data-num>{f.relativeDays(days)}</Box>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Panel>
  );
}
