import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { ArrowRight } from 'lucide-react';
import type { CriticalDates_portfolio$key } from './__generated__/CriticalDates_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import { Panel } from './Panel.tsx';

// The next notices and events that cost money if missed: a calendar leaf for each date, then the
// lease it belongs to. Overdue dates lead, in the danger tone.
export function CriticalDates({ portfolio: ref }: { portfolio: CriticalDates_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment CriticalDates_portfolio on Portfolio {
        keyDateWeeks { start count }
        upcomingKeyDates(first: 7) {
          id kind dueOn daysUntil
          lease { id reference propertyName city }
        }
      }
    `,
    ref,
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const rtl = theme.direction === 'rtl';
  const day = new Intl.DateTimeFormat(intl.locale, { day: 'numeric', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(intl.locale, { month: 'short', timeZone: 'UTC' });

  return (
    <Panel
      title={<FormattedMessage id="dashboard.dates.title" />}
      lede={<FormattedMessage id="dashboard.dates.lede" />}
      action={
        <Button component={RouterLink} to="/leases?keyIn=90" size="small" endIcon={<ArrowRight size={14} aria-hidden style={rtl ? { transform: 'scaleX(-1)' } : undefined} />}>
          <FormattedMessage id="dashboard.dates.viewAll" />
        </Button>
      }
    >
      <WeekStrip weeks={p.keyDateWeeks} />
      {p.upcomingKeyDates.length === 0 ? (
        <Box sx={{ py: 6, color: t.inkSecondary, fontSize: '0.875rem' }}><FormattedMessage id="dashboard.dates.empty" /></Box>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {p.upcomingKeyDates.map((k) => {
            const overdue = k.daysUntil < 0;
            const soon = !overdue && k.daysUntil <= 30;
            const tone = overdue ? t.danger : soon ? t.warning : t.inkSecondary;
            const date = new Date(`${k.dueOn}T00:00:00Z`);
            return (
              <Box component="li" key={k.id} sx={{ borderBottom: `1px solid ${t.rule}`, '&:last-of-type': { borderBottom: 0 } }}>
                <Box
                  component={RouterLink}
                  to={`/leases/${encodeURIComponent(k.lease.id)}`}
                  sx={{
                    display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 4, py: 2.5, px: 1,
                    color: 'inherit', textDecoration: 'none', borderRadius: 1, transition: 'background-color 120ms ease',
                    '&:hover': { backgroundColor: t.brandTint }, '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      textAlign: 'center', borderRadius: 1, overflow: 'hidden', border: `1px solid ${overdue ? t.danger : t.ruleStrong}`, backgroundColor: t.paper,
                    }}
                  >
                    <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', py: 0.25, backgroundColor: overdue ? t.danger : soon ? t.warning : t.ink, color: t.paper }}>
                      {month.format(date)}
                    </Box>
                    <Box data-num sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: '1.25rem', lineHeight: 1.5, fontWeight: 500 }}>{day.format(date)}</Box>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: '0.875rem', fontWeight: 600 }}><FormattedMessage id={`keyDate.${k.kind}`} /></Box>
                    <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', direction: 'ltr', unicodeBidi: 'isolate' }}>{k.lease.reference}</Box>
                      {' · '}{k.lease.propertyName}{k.lease.city ? `, ${k.lease.city}` : ''}
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'end' }}>
                    <Box data-num sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tone, whiteSpace: 'nowrap' }}>
                      {overdue ? <FormattedMessage id="dashboard.dates.overdue" /> : f.relativeDays(k.daysUntil)}
                    </Box>
                    <Box sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{f.date(k.dueOn, 'long')}</Box>
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

// Thirteen weekly columns across the next 90 days, so the spread shows at a glance and the soonest
// few dates in the list below are read against it.
function WeekStrip({ weeks }: { weeks: readonly { start: string; count: number }[] }) {
  const t = useTheme().tokens;
  const f = useFormat();
  const intl = useIntl();
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <Box sx={{ mb: 4 }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: '3px', alignItems: 'end', height: 56 }}>
        {weeks.map((w, i) => (
          <Box component="li" key={w.start} sx={{ height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
            <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
              {intl.formatMessage({ id: 'dashboard.dates.week' }, { date: f.date(w.start), count: w.count })}
            </Box>
            <Box
              aria-hidden
              sx={{
                width: '100%', height: `${Math.max((w.count / max) * 100, w.count ? 6 : 2)}%`, borderRadius: '2px 2px 0 0',
                backgroundColor: i < 5 ? t.warning : t.brand, opacity: w.count ? (i < 5 ? 0.85 : 0.7) : 0.25, transformOrigin: 'bottom',
                '@media (prefers-reduced-motion: no-preference)': {
                  animation: 'week-rise 420ms cubic-bezier(0.2, 0, 0, 1) both', animationDelay: `${i * 25}ms`,
                  '@keyframes week-rise': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
                },
              }}
            />
          </Box>
        ))}
      </Box>
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, fontSize: '0.6875rem', color: t.inkTertiary }} data-num>
        <span>{f.date(weeks[0]?.start ?? '')}</span>
        <FormattedMessage id="dashboard.dates.weeksTotal" values={{ count: weeks.reduce((n, w) => n + w.count, 0) }} />
        <span>{f.date(weeks.at(-1)?.start ?? '')}</span>
      </Box>
    </Box>
  );
}
