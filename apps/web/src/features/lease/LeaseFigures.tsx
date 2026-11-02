import type { ReactNode } from 'react';
import { graphql, useFragment } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { LeaseFigures_lease$key } from './__generated__/LeaseFigures_lease.graphql';
import { useFormat } from '../../i18n/format.ts';

function Figure({ label, value, detail, tone }: { label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: 'warning' | 'danger' }) {
  const theme = useTheme();
  const t = theme.tokens;
  return (
    <Box sx={{ minWidth: 0, py: 4, px: { xs: 0, md: 5 }, '&:first-of-type': { paddingInlineStart: { md: 0 }, gridColumn: { xs: '1 / -1', md: 'auto' } } }}>
      <Box component="dt" sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 1.5 }}>{label}</Box>
      <Box
        component="dd"
        data-num
        sx={{
          m: 0, fontFamily: theme.typography.h1.fontFamily, fontSize: { xs: '1.35rem', md: '1.6rem' }, lineHeight: 1.15,
          fontWeight: theme.direction === 'rtl' ? 600 : 500, color: tone === 'danger' ? t.danger : tone === 'warning' ? t.warning : t.ink,
          '& bdi': { whiteSpace: 'nowrap' },
        }}
      >
        {value}
        {/* Inside the dd: a dl group may hold only dt and dd elements. */}
        {detail && (
          <Box component="span" sx={{ display: 'block', fontFamily: theme.typography.body1.fontFamily, fontWeight: 400, fontSize: '0.8125rem', lineHeight: 1.4, color: t.inkSecondary, mt: 1 }}>
            {detail}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function LeaseFigures({ lease: ref }: { lease: LeaseFigures_lease$key }) {
  const lease = useFragment(
    graphql`
      fragment LeaseFigures_lease on Lease {
        annualRent { amount currency }
        annualRentReporting { amount currency }
        commencementDate
        expiryDate
        termMonths
        daysToExpiry
        nextKeyDate
        nextKeyKind
        areaSqm
        status
      }
    `,
    ref,
  );
  const f = useFormat();
  const intl = useIntl();
  const t = useTheme().tokens;
  const years = Math.floor(lease.termMonths / 12);
  const months = lease.termMonths % 12;
  const daysToNext = lease.nextKeyDate ? Math.round((Date.parse(lease.nextKeyDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000) : null;
  const sameCurrency = lease.annualRent.currency === lease.annualRentReporting.currency;

  return (
    <Box
      component="dl"
      sx={{
        m: 0, mt: 8, display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr)', md: 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr)' },
        borderTop: `1px solid ${t.ruleStrong}`, borderBottom: `1px solid ${t.rule}`,
        columnGap: { xs: 4, md: 0 },
        '& > div + div': { borderInlineStart: { md: `1px solid ${t.rule}` } },
      }}
    >
      <Figure
        label={<FormattedMessage id="lease.figure.passingRent" />}
        value={<bdi>{f.money(lease.annualRent.amount, lease.annualRent.currency)}</bdi>}
        detail={sameCurrency
          ? <FormattedMessage id="lease.figure.perYear" />
          : <FormattedMessage id="lease.figure.reporting" values={{ amount: <bdi>{f.money(lease.annualRentReporting.amount, lease.annualRentReporting.currency)}</bdi> }} />}
      />
      <Figure
        label={<FormattedMessage id="lease.figure.term" />}
        value={<FormattedMessage id="lease.figure.termValue" values={{ years, months }} />}
        detail={`${f.date(lease.commencementDate)} – ${f.date(lease.expiryDate)}`}
      />
      <Figure
        label={<FormattedMessage id={lease.daysToExpiry < 0 ? 'lease.figure.expired' : 'lease.figure.expires'} />}
        value={f.relativeDays(lease.daysToExpiry)}
        detail={f.date(lease.expiryDate, 'long')}
        {...(lease.daysToExpiry >= 0 && lease.daysToExpiry <= 90 ? { tone: 'warning' as const } : lease.daysToExpiry < 0 && lease.status !== 'EXPIRED' ? { tone: 'danger' as const } : {})}
      />
      <Figure
        label={<FormattedMessage id="lease.figure.nextDate" />}
        value={lease.nextKeyDate ? intl.formatMessage({ id: `keyDate.${lease.nextKeyKind}` }) : <FormattedMessage id="lease.figure.noNextDate" />}
        {...(lease.nextKeyDate && daysToNext !== null ? { detail: `${f.date(lease.nextKeyDate)} · ${f.relativeDays(daysToNext)}` } : {})}
        {...(daysToNext !== null && daysToNext <= 30 ? { tone: 'warning' as const } : {})}
      />
      <Figure label={<FormattedMessage id="lease.figure.area" />} value={f.area(lease.areaSqm)} />
    </Box>
  );
}
