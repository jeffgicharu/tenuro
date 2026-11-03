import type { ReactNode } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { PortfolioFigures_portfolio$key } from './__generated__/PortfolioFigures_portfolio.graphql';
import { useFormat } from '../../i18n/format.ts';

// The headline strip: the figures a portfolio head asks for first. Each one that has a list behind
// it links to that list in the register.
export function PortfolioFigures({ portfolio: ref }: { portfolio: PortfolioFigures_portfolio$key }) {
  const p = useFragment(
    graphql`
      fragment PortfolioFigures_portfolio on Portfolio {
        liveLeases
        passingRent { amount currency }
        areaSqm
        wault
        holdingOver
        holdingOverRent { amount currency }
        expiringIn12Months
        expiringIn12MonthsRent { amount currency }
        keyDatesDue
        overdueKeyDates
      }
    `,
    ref,
  );
  const f = useFormat();
  const intl = useIntl();
  const compact = (m: { amount: string; currency: string }) => f.money(m.amount, m.currency, { compact: true });

  return (
    // A list of figures (each may be a link, which a definition list cannot hold).
    <Box
      component="ul"
      sx={{
        listStyle: 'none', m: 0, p: 0, display: 'grid', gap: { xs: 3, md: 0 },
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'minmax(0, 1.5fr) repeat(4, minmax(0, 1fr))' },
      }}
    >
      <Figure
        lead
        label={<FormattedMessage id="dashboard.kpi.passingRent" />}
        value={<bdi title={f.money(p.passingRent.amount, p.passingRent.currency)}>{compact(p.passingRent)}</bdi>}
        detail={<FormattedMessage id="dashboard.kpi.perYear" values={{ count: p.liveLeases, area: f.area(p.areaSqm) }} />}
        to="/leases?status=ACTIVE&status=HOLDING_OVER"
      />
      <Figure
        label={<FormattedMessage id="dashboard.kpi.wault" />}
        value={p.wault ? intl.formatMessage({ id: 'dashboard.kpi.waultValue' }, { years: f.number(p.wault, { maxFractionDigits: 1 }) }) : '—'}
        detail={<FormattedMessage id="dashboard.kpi.waultHint" />}
      />
      <Figure
        label={<FormattedMessage id="dashboard.kpi.expiring" />}
        value={f.number(p.expiringIn12Months)}
        detail={<FormattedMessage id="dashboard.kpi.rentAtStake" values={{ rent: <bdi>{compact(p.expiringIn12MonthsRent)}</bdi> }} />}
        tone={p.expiringIn12Months > 0 ? 'warning' : undefined}
        to="/leases?status=ACTIVE&expIn=365&sort=EXPIRY_DATE.asc"
      />
      <Figure
        label={<FormattedMessage id="dashboard.kpi.holding" />}
        value={f.number(p.holdingOver)}
        detail={<FormattedMessage id="dashboard.kpi.rentAtStake" values={{ rent: <bdi>{compact(p.holdingOverRent)}</bdi> }} />}
        tone={p.holdingOver > 0 ? 'danger' : undefined}
        to="/leases?status=HOLDING_OVER&sort=ANNUAL_RENT.desc"
      />
      <Figure
        label={<FormattedMessage id="dashboard.kpi.keyDates" />}
        value={f.number(p.keyDatesDue)}
        detail={<FormattedMessage id="dashboard.kpi.overdue" values={{ count: p.overdueKeyDates }} />}
        tone={p.overdueKeyDates > 0 ? 'danger' : undefined}
        to="/leases?keyIn=90"
      />
    </Box>
  );
}

function Figure({ label, value, detail, tone, to, lead }: {
  label: ReactNode; value: ReactNode; detail: ReactNode; tone?: 'warning' | 'danger' | undefined; to?: string; lead?: boolean;
}) {
  const theme = useTheme();
  const t = theme.tokens;
  const body = (
    <>
      <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', letterSpacing: '0.02em', color: t.inkSecondary, mb: 1.5 }}>{label}</Box>
      <Box
        component="span"
        data-num
        sx={{
          display: 'block', m: 0, fontFamily: theme.typography.h1.fontFamily, lineHeight: 1.1,
          fontSize: lead ? { xs: '1.9rem', md: '2.6rem' } : { xs: '1.5rem', md: '1.9rem' },
          fontWeight: theme.direction === 'rtl' ? 600 : 500,
          color: tone === 'danger' ? t.danger : tone === 'warning' ? t.warning : t.ink,
          overflowWrap: 'break-word',
        }}
      >
        <Box component="span" data-kpi-value sx={{ display: 'block' }}>{value}</Box>
        <Box component="span" sx={{ display: 'block', mt: 1.25, fontFamily: theme.typography.body1.fontFamily, fontSize: '0.8125rem', fontWeight: 400, lineHeight: 1.4, color: t.inkSecondary }}>
          {detail}
        </Box>
      </Box>
    </>
  );
  const frame = {
    minWidth: 0, py: { xs: 3, md: 5 }, px: { xs: 0, md: 5 }, position: 'relative' as const,
    gridColumn: lead ? { xs: '1 / -1', md: 'auto' } : undefined,
    borderTop: { xs: `1px solid ${t.rule}`, md: 'none' },
    '&:not(:first-of-type)': { borderInlineStart: { md: `1px solid ${t.rule}` } },
    '&:first-of-type': { paddingInlineStart: { md: 0 } },
  };
  if (!to) return <Box component="li" data-kpi sx={frame}>{body}</Box>;
  return (
    <Box component="li" data-kpi sx={{ ...frame, py: 0, px: 0 }}>
      <Box
        component={RouterLink}
        to={to}
        sx={{
          display: 'block', height: '100%', py: { xs: 3, md: 5 }, px: { xs: 0, md: 5 }, paddingInlineStart: lead ? { md: 0 } : undefined, color: 'inherit', textDecoration: 'none',
          borderRadius: 1, transition: 'background-color 140ms ease',
          '&:hover': { backgroundColor: t.brandTint }, '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 },
        }}
      >
        {body}
      </Box>
    </Box>
  );
}
