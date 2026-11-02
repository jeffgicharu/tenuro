import { Suspense } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useRevalidator } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Download } from 'lucide-react';
import type { AccountingPageQuery } from './__generated__/AccountingPageQuery.graphql';
import { accountingQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { downloadCsv } from '../../app/download.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.tsx';
import { Money } from '../../components/Money.tsx';
import { useFormat } from '../../i18n/format.ts';

// The portfolio's lease accounting at today, the way a finance team reports it: the liability split
// into current and non-current, right-of-use assets, this year's charges, the maturity of remaining
// payments, and the liability in each lease currency.
export function AccountingPage() {
  const intl = useIntl();
  const revalidator = useRevalidator();
  return (
    <Box sx={{ px: { xs: 4, md: 8 }, pt: { xs: 5, md: 7 }, pb: 10, maxWidth: 1480 }}>
      <ErrorBoundary
        onRetry={() => void revalidator.revalidate()}
        fallback={(retry) => (
          <EmptyState role="alert" title={intl.formatMessage({ id: 'accounting.error.title' })} body={intl.formatMessage({ id: 'dashboard.error.body' })}
            action={<Button variant="contained" onClick={retry}><FormattedMessage id="common.retry" /></Button>} />
        )}
      >
        <Suspense fallback={<><Typography variant="h1"><FormattedMessage id="accounting.title" /></Typography><Skeleton variant="rounded" height={160} sx={{ mt: 6 }} /><Skeleton variant="rounded" height={320} sx={{ mt: 5 }} /></>}>
          <AccountingContent />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
}

function AccountingContent() {
  const { viewer } = useRouteQuery<AccountingPageQuery>(accountingQuery);
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  if (!viewer) return null;
  const s = viewer.accountingSummary;
  const liability = Number(s.liability.amount);
  const current = Number(s.currentLiability.amount);
  const cur = s.liability.currency;
  const maxBand = Math.max(1, ...s.maturity.map((b) => Number(b.amount.amount)));
  const company = intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name;

  const exportSummary = () => downloadCsv(`accounting-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Measure', 'Amount', 'Currency'],
    ['Lease liability', s.liability.amount, cur],
    ['  of which current', s.currentLiability.amount, cur],
    ['  of which non-current', (liability - current).toFixed(2), cur],
    ['Right-of-use assets', s.rou.amount, cur],
    [`Interest ${s.year}`, s.interestThisYear.amount, cur],
    [`Depreciation ${s.year}`, s.depreciationThisYear.amount, cur],
    [`Operating lease cost ${s.year}`, s.leaseCostThisYear.amount, cur],
    [`Lease payments ${s.year}`, s.cashThisYear.amount, cur],
    [],
    ['Maturity (undiscounted)', 'Amount', 'Currency'],
    ...s.maturity.map((b) => [intl.formatMessage({ id: `lease.accounting.band.${b.key}` }), b.amount.amount, cur]),
    [],
    ['Lease currency', 'Leases', 'Liability (lease currency)'],
    ...s.byCurrency.map((c) => [c.liability.currency, c.leases, c.liability.amount]),
  ]);

  const Figure = ({ label, value, hint, lead }: { label: string; value: React.ReactNode; hint?: React.ReactNode; lead?: boolean }) => (
    <Box component="li" sx={{ minWidth: 0, py: { xs: 3, md: 5 }, px: { xs: 0, md: 5 }, gridColumn: lead ? { xs: '1 / -1', md: 'auto' } : undefined, '&:first-of-type': { paddingInlineStart: { md: 0 } }, '& + &': { borderInlineStart: { md: `1px solid ${t.rule}` } }, borderTop: { xs: `1px solid ${t.rule}`, md: 'none' } }}>
      <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 1.5 }}>{label}</Box>
      <Box data-num sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: lead ? { xs: '1.9rem', md: '2.4rem' } : { xs: '1.4rem', md: '1.7rem' }, lineHeight: 1.1, '& bdi': { whiteSpace: 'nowrap' } }}>{value}</Box>
      {hint && <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mt: 1 }}>{hint}</Box>}
    </Box>
  );
  const compact = (m: { amount: string; currency: string }) => <bdi title={f.money(m.amount, m.currency)}>{f.money(m.amount, m.currency, { compact: true })}</bdi>;

  return (
    <>
      <Box component="header" sx={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: 4, mb: 6 }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="h1"><FormattedMessage id="accounting.title" /></Typography>
          <Box sx={{ mt: 1, fontSize: '0.875rem', color: t.inkSecondary }}>
            <FormattedMessage id="accounting.lede" values={{ company, date: f.date(new Date().toISOString().slice(0, 10), 'long'), currency: cur }} />
          </Box>
        </Box>
        <Button variant="outlined" startIcon={<Download size={16} aria-hidden />} onClick={exportSummary}><FormattedMessage id="accounting.export" /></Button>
      </Box>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mb: 7, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))' }, borderTop: `2px solid ${t.ink}`, borderBottom: `1px solid ${t.rule}` }}>
        <Figure lead label={intl.formatMessage({ id: 'accounting.liability' })} value={compact(s.liability)}
          hint={<FormattedMessage id="accounting.split" values={{ current: f.money(String(current), cur, { compact: true }), nonCurrent: f.money(String(liability - current), cur, { compact: true }) }} />} />
        <Figure label={intl.formatMessage({ id: 'accounting.rou' })} value={compact(s.rou)} hint={<FormattedMessage id="accounting.measured" values={{ count: s.leasesMeasured }} />} />
        <Figure label={intl.formatMessage({ id: 'accounting.interest' }, { year: s.year })} value={compact(s.interestThisYear)}
          hint={<FormattedMessage id="accounting.depreciation" values={{ amount: f.money(s.depreciationThisYear.amount, cur, { compact: true }) }} />} />
        <Figure label={intl.formatMessage({ id: 'accounting.cash' }, { year: s.year })} value={compact(s.cashThisYear)}
          hint={Number(s.leaseCostThisYear.amount) > 0 ? <FormattedMessage id="accounting.operatingCost" values={{ amount: f.money(s.leaseCostThisYear.amount, cur, { compact: true }) }} /> : undefined} />
      </Box>

      <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' } }}>
        <Box component="section" aria-labelledby="acc-maturity" sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: { xs: 4, md: 6 } }}>
          <Box component="h2" id="acc-maturity" sx={{ ...theme.typography.h3, m: 0 }}><FormattedMessage id="lease.accounting.maturityTitle" /></Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mt: 0.5, mb: 4 }}><FormattedMessage id="accounting.maturityLede" /></Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {s.maturity.map((b, i) => (
                <tr key={b.key}>
                  <Box component="th" scope="row" sx={{ textAlign: 'start', fontWeight: 500, fontSize: '0.8125rem', py: 1.5, pr: 3, whiteSpace: 'nowrap', width: '1%' }}><FormattedMessage id={`lease.accounting.band.${b.key}`} /></Box>
                  <Box component="td" sx={{ py: 1.5, width: '100%' }} aria-hidden>
                    <Box sx={{ height: 12, borderRadius: 1, backgroundColor: t.sunken }}>
                      <Box sx={{ height: '100%', borderRadius: 1, width: `${(Number(b.amount.amount) / maxBand) * 100}%`, backgroundColor: i === 0 ? t.warning : t.brand,
                        transformOrigin: theme.direction === 'rtl' ? 'right' : 'left',
                        '@media (prefers-reduced-motion: no-preference)': { animation: 'grow 520ms cubic-bezier(0.2, 0, 0, 1) both', animationDelay: `${i * 50}ms`, '@keyframes grow': { from: { transform: 'scaleX(0)' } } } }} />
                    </Box>
                  </Box>
                  <Box component="td" data-num sx={{ textAlign: 'end', fontSize: '0.8125rem', fontWeight: 600, py: 1.5, pl: 3, whiteSpace: 'nowrap' }}><Money value={b.amount} compact /></Box>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
        <Box component="section" aria-labelledby="acc-currency" sx={{ border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: { xs: 4, md: 6 } }}>
          <Box component="h2" id="acc-currency" sx={{ ...theme.typography.h3, m: 0 }}><FormattedMessage id="accounting.byCurrency" /></Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mt: 0.5, mb: 4 }}><FormattedMessage id="accounting.byCurrencyLede" /></Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <Box component="th" scope="col" sx={{ textAlign: 'start', color: t.inkSecondary, fontWeight: 600, pb: 1.5, borderBottom: `1px solid ${t.ruleStrong}` }}><FormattedMessage id="accounting.col.currency" /></Box>
                <Box component="th" scope="col" sx={{ textAlign: 'end', color: t.inkSecondary, fontWeight: 600, pb: 1.5, borderBottom: `1px solid ${t.ruleStrong}` }}><FormattedMessage id="accounting.col.leases" /></Box>
                <Box component="th" scope="col" sx={{ textAlign: 'end', color: t.inkSecondary, fontWeight: 600, pb: 1.5, borderBottom: `1px solid ${t.ruleStrong}` }}><FormattedMessage id="accounting.col.liability" /></Box>
              </tr>
            </thead>
            <tbody>
              {s.byCurrency.map((c) => (
                <tr key={c.liability.currency}>
                  <Box component="td" sx={{ py: 1.5, borderBottom: `1px solid ${t.rule}`, fontWeight: 600 }}>{c.liability.currency}</Box>
                  <Box component="td" data-num sx={{ py: 1.5, borderBottom: `1px solid ${t.rule}`, textAlign: 'end' }}>{f.number(c.leases)}</Box>
                  <Box component="td" data-num sx={{ py: 1.5, borderBottom: `1px solid ${t.rule}`, textAlign: 'end' }}><Money value={c.liability} whole showCode={false} /></Box>
                </tr>
              ))}
            </tbody>
          </Box>
          <Box sx={{ mt: 4, fontSize: '0.75rem', color: t.inkSecondary }}>
            {s.byStandard.map((b) => (
              <Box key={b.standard}><FormattedMessage id="accounting.standardCount" values={{ standard: intl.formatMessage({ id: `lease.accounting.standard.${b.standard}` }), count: b.leases }} /></Box>
            ))}
            {s.leasesUnmeasured > 0 && <Box sx={{ color: t.warning }}><FormattedMessage id="accounting.unmeasured" values={{ count: s.leasesUnmeasured }} /></Box>}
          </Box>
        </Box>
      </Box>
    </>
  );
}
