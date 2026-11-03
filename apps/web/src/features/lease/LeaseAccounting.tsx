import { useMemo, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { Download } from 'lucide-react';
import type { LeaseAccountingQuery } from './__generated__/LeaseAccountingQuery.graphql';
import { EmptyState } from '../../components/EmptyState.tsx';
import { CompactMoney } from '../../components/CompactMoney.tsx';
import { Money } from '../../components/Money.tsx';
import { useFormat } from '../../i18n/format.ts';
import { downloadCsv } from '../../app/download.ts';

// The lease measured under its standard (IFRS 16, or ASC 842 finance or operating): today's carrying
// amounts, how the liability and right-of-use asset run down, the maturity of what is still to pay,
// any remeasurements, the full period schedule and the journals. Computed on demand by the API's
// ledger engine, so it loads when this tab opens.
export function LeaseAccounting({ leaseId, reference }: { leaseId: string; reference: string }) {
  const data = useLazyLoadQuery<LeaseAccountingQuery>(
    graphql`
      query LeaseAccountingQuery($id: ID!, $year: Int) {
        node(id: $id) {
          ... on Lease @alias(as: "lease") {
            status commencementDate expiryDate
            accounting {
              measuredAs exemption annualDiscountRate termPeriods periodsPerYear
              initialLiability { amount currency } initialRou { amount currency }
              liabilityToday { amount currency } rouToday { amount currency }
              totalPayments { amount currency } totalInterest { amount currency } futureInterest { amount currency }
              thisYear { year interest { amount currency } depreciation { amount currency } leaseCost { amount currency } cashPaid { amount currency } }
              maturity { key amount { amount currency } }
              remeasurements { effectiveDate liabilityAdjustment { amount currency } rouAdjustment { amount currency } }
              schedule {
                period startDate endDate paymentDate
                openingLiability { amount currency } payment { amount currency } interest { amount currency } closingLiability { amount currency }
                depreciation { amount currency } closingRou { amount currency } leaseCost { amount currency }
              }
              journals(year: $year) { period date kind memo lines { account accountName debit { amount currency } credit { amount currency } } }
            }
          }
        }
      }
    `,
    { id: leaseId, year: new Date().getUTCFullYear() },
    { fetchPolicy: 'store-or-network' },
  );
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const lease = data.node?.lease;
  const a = lease?.accounting;
  const [showAll, setShowAll] = useState(false);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const chart = useMemo(() => {
    if (!a) return null;
    const rows = a.schedule;
    const points = [{ date: rows[0]?.startDate ?? today, liability: Number(a.initialLiability.amount), rou: Number(a.initialRou.amount) },
      ...rows.map((r) => ({ date: r.endDate, liability: Number(r.closingLiability.amount), rou: Number(r.closingRou.amount) }))];
    const max = Math.max(1, ...points.map((p) => Math.max(p.liability, p.rou)));
    const W = 600; const H = 160; const n = Math.max(1, points.length - 1);
    const x = (i: number) => (i / n) * W;
    const y = (v: number) => H - (v / max) * H;
    const line = (k: 'liability' | 'rou') => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
    const todayIndex = points.findIndex((p) => p.date >= today);
    return { W, H, max, points, x, y, liab: line('liability'), rou: line('rou'), todayX: todayIndex > 0 ? x(todayIndex) : null };
  }, [a, today]);
  const [hover, setHover] = useState<number | null>(null);

  if (!a) {
    return <EmptyState title={intl.formatMessage({ id: 'lease.accounting.unavailable.title' })} body={intl.formatMessage({ id: 'lease.accounting.unavailable.body' })} />;
  }
  const operating = a.measuredAs === 'ASC842_OPERATING';
  const exempt = a.exemption !== 'NONE';
  const rows = showAll ? a.schedule : a.schedule.filter((r) => r.endDate >= today).slice(0, 12);
  // Journals summarised by month: one row per account with its debit and credit totals, each month
  // opening to its entries.
  const cur = a.initialLiability.currency;
  // The currency's minor units (amounts arrive as plain decimals without trailing zeros).
  const dp = new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits ?? 2;
  const monthLabel = new Intl.DateTimeFormat(intl.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  type MonthGroup = { key: string; label: string; entries: (typeof a.journals)[number][]; accounts: Map<string, { account: string; name: string; debit: number; credit: number }> };
  const byMonth = new Map<string, MonthGroup>();
  for (const j of a.journals) {
    const key = j.date.slice(0, 7);
    const mo: MonthGroup = byMonth.get(key) ?? { key, label: monthLabel.format(new Date(`${key}-01T00:00:00Z`)), entries: [], accounts: new Map() };
    mo.entries.push(j);
    for (const l of j.lines) {
      const acc = mo.accounts.get(l.account) ?? { account: l.account, name: l.accountName, debit: 0, credit: 0 };
      acc.debit += Number(l.debit.amount); acc.credit += Number(l.credit.amount);
      mo.accounts.set(l.account, acc);
    }
    byMonth.set(key, mo);
  }
  const months = [...byMonth.values()].map((m) => ({ ...m, accounts: [...m.accounts.values()].sort((x, y) => x.account.localeCompare(y.account)) }));
  const exportJournals = () => downloadCsv(`${reference}-journals-${a.thisYear.year}.csv`, [
    ['Date', 'Kind', 'Memo', 'Account', 'Account name', 'Debit', 'Credit', 'Currency'],
    ...a.journals.flatMap((j) => j.lines.map((l) => [j.date, j.kind, j.memo, l.account, l.accountName, l.debit.amount, l.credit.amount, cur])),
  ]);

  const exportSchedule = () => downloadCsv(`${reference}-schedule.csv`, [
    ['Period', 'Start', 'End', 'Payment date', 'Opening liability', 'Payment', 'Interest', 'Closing liability', 'Depreciation', 'Closing ROU', 'Lease cost', 'Currency'],
    ...a.schedule.map((r) => [r.period, r.startDate, r.endDate, r.paymentDate, r.openingLiability.amount, r.payment.amount, r.interest.amount, r.closingLiability.amount, r.depreciation.amount, r.closingRou.amount, r.leaseCost.amount, r.payment.currency]),
  ]);

  const Figure = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) => (
    <Box data-kpi sx={{ minWidth: 0, py: 3, px: { xs: 0, md: 4 }, '&:first-of-type': { paddingInlineStart: { md: 0 } }, '& + &': { borderInlineStart: { md: `1px solid ${t.rule}` } } }}>
      <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 1 }}>{label}</Box>
      <Box data-num data-kpi-value sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: '1.4rem', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{value}</Box>
      {hint && <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary, mt: 0.5, overflowWrap: 'anywhere' }}>{hint}</Box>}
    </Box>
  );
  const th = { textAlign: 'end' as const, fontWeight: 600, fontSize: '0.75rem', color: t.inkSecondary, py: 1.5, px: 2, borderBottom: `1px solid ${t.ruleStrong}`, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: t.surface };
  const td = { textAlign: 'end' as const, py: 1.25, px: 2, borderBottom: `1px solid ${t.rule}`, whiteSpace: 'nowrap' as const, fontSize: '0.8125rem' };

  return (
    <Box sx={{ display: 'grid', gap: 7 }}>
      <Box>
        <Box sx={{ fontSize: '0.875rem', color: t.inkSecondary, mb: 3 }}>
          <FormattedMessage
            id="lease.accounting.basis"
            values={{
              standard: <strong><FormattedMessage id={`lease.accounting.standard.${a.measuredAs}`} /></strong>,
              rate: f.percent(a.annualDiscountRate, 2),
              periods: a.termPeriods,
              frequency: intl.formatMessage({ id: `lease.accounting.perYear.${a.periodsPerYear}` }),
            }}
          />
          {exempt && <> <FormattedMessage id={`lease.accounting.exempt.${a.exemption}`} /></>}
        </Box>
        {/* A lease past its term, or not yet started, carries nothing today: say why instead of showing a row of zeros. */}
        {(lease?.status === 'HOLDING_OVER' || (lease && today < lease.commencementDate)) && (
          <Alert severity="info" sx={{ mb: 4 }}>
            {lease.status === 'HOLDING_OVER'
              ? <FormattedMessage id="lease.accounting.holdingOverNote" values={{ date: f.date(lease.expiryDate, 'long') }} />
              : <FormattedMessage id="lease.accounting.notStartedNote" values={{ date: f.date(lease.commencementDate, 'long') }} />}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, borderTop: `2px solid ${t.ink}`, borderBottom: `1px solid ${t.rule}` }}>
          <Figure label={intl.formatMessage({ id: 'lease.accounting.liabilityToday' })} value={<CompactMoney value={a.liabilityToday} />} hint={<FormattedMessage id="lease.accounting.atCommencement" values={{ amount: f.money(a.initialLiability.amount, a.initialLiability.currency, { compact: true }) }} />} />
          <Figure label={intl.formatMessage({ id: 'lease.accounting.rouToday' })} value={<CompactMoney value={a.rouToday} />} hint={<FormattedMessage id="lease.accounting.atCommencement" values={{ amount: f.money(a.initialRou.amount, a.initialRou.currency, { compact: true }) }} />} />
          {operating ? (
            <Figure label={intl.formatMessage({ id: 'lease.accounting.leaseCostYear' }, { year: a.thisYear.year })} value={<CompactMoney value={a.thisYear.leaseCost} />} hint={<FormattedMessage id="lease.accounting.straightLine" />} />
          ) : (
            <Figure label={intl.formatMessage({ id: 'lease.accounting.interestYear' }, { year: a.thisYear.year })} value={<CompactMoney value={a.thisYear.interest} />} hint={<FormattedMessage id="lease.accounting.depreciationYear" values={{ amount: f.money(a.thisYear.depreciation.amount, a.thisYear.depreciation.currency, { compact: true }) }} />} />
          )}
          <Figure label={intl.formatMessage({ id: 'lease.accounting.futureInterest' })} value={<CompactMoney value={a.futureInterest} />} hint={<FormattedMessage id="lease.accounting.totalPayments" values={{ amount: f.money(a.totalPayments.amount, a.totalPayments.currency, { compact: true }) }} />} />
        </Box>
      </Box>

      {chart && (
        <Box component="section" aria-labelledby="acc-chart">
          <Box component="h2" id="acc-chart" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.chartTitle" /></Box>
          <Box sx={{ display: 'flex', gap: 4, fontSize: '0.75rem', color: t.inkSecondary, mb: 2 }}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><Box component="span" sx={{ width: 14, height: 3, backgroundColor: t.brand }} /><FormattedMessage id="lease.accounting.liability" /></Box>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><Box component="span" sx={{ width: 14, height: 0, borderTop: `2px dashed ${t.accent}` }} /><FormattedMessage id="lease.accounting.rou" /></Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2 }}>
            {/* A light value axis: zero, half and the largest balance. */}
            <Box aria-hidden data-num sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 180, fontSize: '0.625rem', color: t.inkTertiary, textAlign: 'end', py: 0 }}>
              <span>{f.money(String(chart.max), a.initialLiability.currency, { compact: true, showCode: false })}</span>
              <span>{f.money(String(chart.max / 2), a.initialLiability.currency, { compact: true, showCode: false })}</span>
              <span>0</span>
            </Box>
            <Box sx={{ position: 'relative' }}>
              <Box
                component="svg"
                viewBox={`0 0 ${chart.W} ${chart.H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={intl.formatMessage({ id: 'lease.accounting.chartAlt' })}
                onMouseMove={(e: React.MouseEvent<SVGSVGElement>) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  const frac = (theme.direction === 'rtl' ? box.right - e.clientX : e.clientX - box.left) / box.width;
                  setHover(Math.max(0, Math.min(chart.points.length - 1, Math.round(frac * (chart.points.length - 1)))));
                }}
                onMouseLeave={() => setHover(null)}
                sx={{ width: '100%', height: 180, display: 'block', backgroundColor: t.sunken, borderRadius: 1, transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }}
              >
                {[0.5, 1].map((g) => <line key={g} x1={0} x2={chart.W} y1={chart.H * (1 - g)} y2={chart.H * (1 - g)} stroke={t.rule} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
                {chart.todayX !== null && <line x1={chart.todayX} x2={chart.todayX} y1={0} y2={chart.H} stroke={t.ink} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
                <polyline points={chart.rou} fill="none" stroke={t.accent} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                <polyline points={chart.liab} fill="none" stroke={t.brand} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                {hover !== null && <line x1={chart.x(hover)} x2={chart.x(hover)} y1={0} y2={chart.H} stroke={t.inkSecondary} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              </Box>
              {hover !== null && chart.points[hover] && (
                <Box role="status" data-num sx={{
                  position: 'absolute', top: 8, [hover > chart.points.length / 2 ? 'insetInlineStart' : 'insetInlineEnd']: 8, pointerEvents: 'none',
                  backgroundColor: t.surface, border: `1px solid ${t.ruleStrong}`, borderRadius: 1, px: 2, py: 1.25, fontSize: '0.75rem', boxShadow: '0 4px 12px -6px rgba(0,0,0,0.25)',
                }}>
                  <Box sx={{ fontWeight: 600, mb: 0.5 }}>{f.date(chart.points[hover].date)}</Box>
                  <Box sx={{ color: t.brand }}><FormattedMessage id="lease.accounting.liability" />: {f.money(String(chart.points[hover].liability), a.initialLiability.currency)}</Box>
                  <Box sx={{ color: t.inkSecondary }}><FormattedMessage id="lease.accounting.rou" />: {f.money(String(chart.points[hover].rou), a.initialLiability.currency)}</Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 6, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box component="section" aria-labelledby="acc-maturity">
          <Box component="h2" id="acc-maturity" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.maturityTitle" /></Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mb: 2 }}><FormattedMessage id="lease.accounting.maturityLede" /></Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {a.maturity.map((b) => (
                <Box component="tr" key={b.key}>
                  <Box component="th" scope="row" sx={{ ...td, textAlign: 'start', fontWeight: 500 }}><FormattedMessage id={`lease.accounting.band.${b.key}`} /></Box>
                  <Box component="td" sx={td} data-num><Money value={b.amount} /></Box>
                </Box>
              ))}
            </tbody>
          </Box>
        </Box>
        <Box component="section" aria-labelledby="acc-remeasure">
          <Box component="h2" id="acc-remeasure" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.remeasureTitle" /></Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mb: 2 }}><FormattedMessage id="lease.accounting.remeasureLede" /></Box>
          {a.remeasurements.length === 0 ? (
            <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="lease.accounting.noRemeasure" /></Box>
          ) : (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Box component="th" sx={{ ...th, textAlign: 'start', position: 'static' }}><FormattedMessage id="lease.accounting.col.date" /></Box>
                <Box component="th" sx={{ ...th, position: 'static' }}><FormattedMessage id="lease.accounting.col.liabilityChange" /></Box>
                <Box component="th" sx={{ ...th, position: 'static' }}><FormattedMessage id="lease.accounting.col.rouChange" /></Box>
              </tr></thead>
              <tbody>
                {a.remeasurements.map((r) => (
                  <tr key={r.effectiveDate}>
                    <Box component="td" sx={{ ...td, textAlign: 'start' }} data-num>{f.date(r.effectiveDate)}</Box>
                    <Box component="td" sx={td} data-num><Money value={r.liabilityAdjustment} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.rouAdjustment} /></Box>
                  </tr>
                ))}
              </tbody>
            </Box>
          )}
        </Box>
      </Box>

      <Box component="section" aria-labelledby="acc-schedule">
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <Box component="h2" id="acc-schedule" sx={{ ...theme.typography.h3, m: 0, flex: 1 }}><FormattedMessage id="lease.accounting.scheduleTitle" /></Box>
          <Button size="small" onClick={() => setShowAll((v) => !v)}><FormattedMessage id={showAll ? 'lease.accounting.showUpcoming' : 'lease.accounting.showAll'} values={{ count: a.schedule.length }} /></Button>
          <Button size="small" variant="outlined" startIcon={<Download size={14} aria-hidden />} onClick={exportSchedule}><FormattedMessage id="lease.accounting.exportCsv" /></Button>
        </Box>
        <Box tabIndex={0} role="region" aria-label={intl.formatMessage({ id: 'lease.accounting.scheduleTable' })} sx={{ overflow: 'auto', maxHeight: 480, border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface, '&:focus-visible': { outline: `2px solid ${t.focus}` } }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['period', 'paymentDate', 'opening', 'payment', 'interest', 'closing', operating ? 'leaseCost' : 'depreciation', 'rou'].map((c) => (
                  <Box component="th" key={c} scope="col" sx={{ ...th, ...(c === 'period' || c === 'paymentDate' ? { textAlign: 'start' } : {}) }}><FormattedMessage id={`lease.accounting.col.${c}`} /></Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const current = r.startDate <= today && today <= r.endDate;
                return (
                  <Box component="tr" key={r.period} sx={{ backgroundColor: current ? t.brandTint : 'transparent' }} aria-current={current ? 'date' : undefined}>
                    <Box component="td" sx={{ ...td, textAlign: 'start' }} data-num>{r.period}</Box>
                    <Box component="td" sx={{ ...td, textAlign: 'start' }} data-num>{f.date(r.paymentDate)}</Box>
                    <Box component="td" sx={td} data-num><Money value={r.openingLiability} showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.payment} showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.interest} showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.closingLiability} showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={operating ? r.leaseCost : r.depreciation} showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.closingRou} showCode={false} /></Box>
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="acc-journals">
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 1 }}>
          <Box component="h2" id="acc-journals" sx={{ ...theme.typography.h3, m: 0, flex: 1 }}><FormattedMessage id="lease.accounting.journalsTitle" values={{ year: a.thisYear.year }} /></Box>
          <Button size="small" variant="outlined" startIcon={<Download size={14} aria-hidden />} onClick={exportJournals} disabled={a.journals.length === 0}><FormattedMessage id="lease.accounting.exportJournals" /></Button>
        </Box>
        <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mb: 3 }}><FormattedMessage id="lease.accounting.journalsLede" /></Box>
        {months.length === 0 ? (
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="lease.accounting.noJournals" /></Box>
        ) : (
          <Box sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface, overflow: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Box component="th" scope="col" sx={{ ...th, textAlign: 'start', position: 'static' }}><FormattedMessage id="lease.accounting.col.month" /></Box>
                  <Box component="th" scope="col" sx={{ ...th, textAlign: 'start', position: 'static' }}><FormattedMessage id="lease.accounting.col.account" /></Box>
                  <Box component="th" scope="col" sx={{ ...th, position: 'static' }}><FormattedMessage id="lease.accounting.col.debit" /></Box>
                  <Box component="th" scope="col" sx={{ ...th, position: 'static' }}><FormattedMessage id="lease.accounting.col.credit" /></Box>
                </tr>
              </thead>
              {months.map((mo) => {
                const isOpen = openMonth === mo.key;
                return (
                  <tbody key={mo.key}>
                    {mo.accounts.map((acc, i) => (
                      <tr key={acc.account}>
                        {i === 0 && (
                          <Box component="th" scope="rowgroup" rowSpan={mo.accounts.length + (isOpen ? 1 : 0)} sx={{ ...td, textAlign: 'start', verticalAlign: 'top', fontWeight: 600, borderBottom: `1px solid ${t.ruleStrong}` }}>
                            <Box>{mo.label}</Box>
                            <Button size="small" sx={{ mt: 0.5, px: 0.5, minWidth: 0, fontSize: '0.75rem' }} aria-expanded={isOpen} onClick={() => setOpenMonth(isOpen ? null : mo.key)}>
                              <FormattedMessage id={isOpen ? 'lease.accounting.hideEntries' : 'lease.accounting.showEntries'} values={{ count: mo.entries.length }} />
                            </Button>
                          </Box>
                        )}
                        <Box component="td" sx={{ ...td, textAlign: 'start', ...(i === mo.accounts.length - 1 && !isOpen ? { borderBottom: `1px solid ${t.ruleStrong}` } : {}) }}>
                          <Box component="span" data-num sx={{ color: t.inkTertiary, marginInlineEnd: 1.5 }}>{acc.account}</Box>{acc.name}
                        </Box>
                        <Box component="td" sx={{ ...td, ...(i === mo.accounts.length - 1 && !isOpen ? { borderBottom: `1px solid ${t.ruleStrong}` } : {}) }} data-num>{acc.debit ? f.money(acc.debit.toFixed(dp), cur, { showCode: false }) : ''}</Box>
                        <Box component="td" sx={{ ...td, ...(i === mo.accounts.length - 1 && !isOpen ? { borderBottom: `1px solid ${t.ruleStrong}` } : {}) }} data-num>{acc.credit ? f.money(acc.credit.toFixed(dp), cur, { showCode: false }) : ''}</Box>
                      </tr>
                    ))}
                    {isOpen && (
                      <tr>
                        <Box component="td" colSpan={3} sx={{ ...td, textAlign: 'start', whiteSpace: 'normal', backgroundColor: t.paper, borderBottom: `1px solid ${t.ruleStrong}` }}>
                          {mo.entries.map((j, k) => (
                            <Box key={k} sx={{ py: 1, '& + &': { borderTop: `1px dashed ${t.rule}` } }}>
                              <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 0.5 }} data-num>{f.date(j.date)} · <FormattedMessage id={`lease.accounting.journal.${j.kind}`} /></Box>
                              {j.lines.map((l, m) => (
                                <Box key={m} data-num sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 120px', gap: 2, fontSize: '0.75rem', paddingInlineStart: Number(l.credit.amount) > 0 ? 4 : 0 }}>
                                  <span>{l.account} {l.accountName}</span>
                                  <Box component="span" sx={{ textAlign: 'end' }}>{Number(l.debit.amount) > 0 ? f.money(l.debit.amount, cur, { showCode: false }) : ''}</Box>
                                  <Box component="span" sx={{ textAlign: 'end' }}>{Number(l.credit.amount) > 0 ? f.money(l.credit.amount, cur, { showCode: false }) : ''}</Box>
                                </Box>
                              ))}
                            </Box>
                          ))}
                        </Box>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
