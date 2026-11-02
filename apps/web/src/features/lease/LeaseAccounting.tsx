import { useMemo, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { Download } from 'lucide-react';
import type { LeaseAccountingQuery } from './__generated__/LeaseAccountingQuery.graphql';
import { EmptyState } from '../../components/EmptyState.tsx';
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
  const a = data.node?.lease?.accounting;
  const [showAll, setShowAll] = useState(false);
  const [journalKind, setJournalKind] = useState('ALL');
  const today = new Date().toISOString().slice(0, 10);

  const chart = useMemo(() => {
    if (!a) return null;
    const rows = a.schedule;
    const max = Math.max(1, ...rows.map((r) => Math.max(Number(r.openingLiability.amount), Number(r.closingRou.amount))), Number(a.initialRou.amount));
    const W = 600; const H = 160; const n = Math.max(1, rows.length);
    const pt = (i: number, v: number) => `${((i / n) * W).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`;
    const liab = [pt(0, Number(a.initialLiability.amount)), ...rows.map((r, i) => pt(i + 1, Number(r.closingLiability.amount)))].join(' ');
    const rou = [pt(0, Number(a.initialRou.amount)), ...rows.map((r, i) => pt(i + 1, Number(r.closingRou.amount)))].join(' ');
    const todayIndex = rows.findIndex((r) => r.startDate <= today && today <= r.endDate);
    return { W, H, liab, rou, todayX: todayIndex >= 0 ? ((todayIndex + 0.5) / n) * W : null };
  }, [a, today]);

  if (!a) {
    return <EmptyState title={intl.formatMessage({ id: 'lease.accounting.unavailable.title' })} body={intl.formatMessage({ id: 'lease.accounting.unavailable.body' })} />;
  }
  const operating = a.measuredAs === 'ASC842_OPERATING';
  const exempt = a.exemption !== 'NONE';
  const rows = showAll ? a.schedule : a.schedule.filter((r) => r.endDate >= today).slice(0, 12);
  const kinds = [...new Set(a.journals.map((j) => j.kind))];
  const journals = a.journals.filter((j) => journalKind === 'ALL' || j.kind === journalKind);

  const exportSchedule = () => downloadCsv(`${reference}-schedule.csv`, [
    ['Period', 'Start', 'End', 'Payment date', 'Opening liability', 'Payment', 'Interest', 'Closing liability', 'Depreciation', 'Closing ROU', 'Lease cost', 'Currency'],
    ...a.schedule.map((r) => [r.period, r.startDate, r.endDate, r.paymentDate, r.openingLiability.amount, r.payment.amount, r.interest.amount, r.closingLiability.amount, r.depreciation.amount, r.closingRou.amount, r.leaseCost.amount, r.payment.currency]),
  ]);

  const Figure = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) => (
    <Box sx={{ minWidth: 0, py: 3, px: { xs: 0, md: 4 }, '&:first-of-type': { paddingInlineStart: { md: 0 } }, '& + &': { borderInlineStart: { md: `1px solid ${t.rule}` } } }}>
      <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, mb: 1 }}>{label}</Box>
      <Box data-num sx={{ fontFamily: theme.typography.h1.fontFamily, fontSize: '1.4rem', lineHeight: 1.15 }}>{value}</Box>
      {hint && <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary, mt: 0.5 }}>{hint}</Box>}
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, borderTop: `2px solid ${t.ink}`, borderBottom: `1px solid ${t.rule}` }}>
          <Figure label={intl.formatMessage({ id: 'lease.accounting.liabilityToday' })} value={<Money value={a.liabilityToday} whole />} hint={<FormattedMessage id="lease.accounting.atCommencement" values={{ amount: f.money(a.initialLiability.amount, a.initialLiability.currency, { whole: true }) }} />} />
          <Figure label={intl.formatMessage({ id: 'lease.accounting.rouToday' })} value={<Money value={a.rouToday} whole />} hint={<FormattedMessage id="lease.accounting.atCommencement" values={{ amount: f.money(a.initialRou.amount, a.initialRou.currency, { whole: true }) }} />} />
          {operating ? (
            <Figure label={intl.formatMessage({ id: 'lease.accounting.leaseCostYear' }, { year: a.thisYear.year })} value={<Money value={a.thisYear.leaseCost} whole />} hint={<FormattedMessage id="lease.accounting.straightLine" />} />
          ) : (
            <Figure label={intl.formatMessage({ id: 'lease.accounting.interestYear' }, { year: a.thisYear.year })} value={<Money value={a.thisYear.interest} whole />} hint={<FormattedMessage id="lease.accounting.depreciationYear" values={{ amount: f.money(a.thisYear.depreciation.amount, a.thisYear.depreciation.currency, { whole: true }) }} />} />
          )}
          <Figure label={intl.formatMessage({ id: 'lease.accounting.futureInterest' })} value={<Money value={a.futureInterest} whole />} hint={<FormattedMessage id="lease.accounting.totalPayments" values={{ amount: f.money(a.totalPayments.amount, a.totalPayments.currency, { compact: true }) }} />} />
        </Box>
      </Box>

      {chart && (
        <Box component="section" aria-labelledby="acc-chart">
          <Box component="h3" id="acc-chart" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.chartTitle" /></Box>
          <Box sx={{ display: 'flex', gap: 4, fontSize: '0.75rem', color: t.inkSecondary, mb: 2 }}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><Box component="span" sx={{ width: 14, height: 3, backgroundColor: t.brand }} /><FormattedMessage id="lease.accounting.liability" /></Box>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><Box component="span" sx={{ width: 14, height: 0, borderTop: `2px dashed ${t.accent}` }} /><FormattedMessage id="lease.accounting.rou" /></Box>
          </Box>
          <Box component="svg" viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" role="img" aria-label={intl.formatMessage({ id: 'lease.accounting.chartAlt' })} sx={{ width: '100%', height: 180, display: 'block', backgroundColor: t.sunken, borderRadius: 1 }}>
            {chart.todayX !== null && <line x1={chart.todayX} x2={chart.todayX} y1={0} y2={chart.H} stroke={t.ink} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            <polyline points={chart.rou} fill="none" stroke={t.accent} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            <polyline points={chart.liab} fill="none" stroke={t.brand} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 6, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box component="section" aria-labelledby="acc-maturity">
          <Box component="h3" id="acc-maturity" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.maturityTitle" /></Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mb: 2 }}><FormattedMessage id="lease.accounting.maturityLede" /></Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {a.maturity.map((b) => (
                <Box component="tr" key={b.key}>
                  <Box component="th" scope="row" sx={{ ...td, textAlign: 'start', fontWeight: 500 }}><FormattedMessage id={`lease.accounting.band.${b.key}`} /></Box>
                  <Box component="td" sx={td} data-num><Money value={b.amount} whole /></Box>
                </Box>
              ))}
            </tbody>
          </Box>
        </Box>
        <Box component="section" aria-labelledby="acc-remeasure">
          <Box component="h3" id="acc-remeasure" sx={{ ...theme.typography.h3, m: 0, mb: 1 }}><FormattedMessage id="lease.accounting.remeasureTitle" /></Box>
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
                    <Box component="td" sx={td} data-num><Money value={r.liabilityAdjustment} whole /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.rouAdjustment} whole /></Box>
                  </tr>
                ))}
              </tbody>
            </Box>
          )}
        </Box>
      </Box>

      <Box component="section" aria-labelledby="acc-schedule">
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <Box component="h3" id="acc-schedule" sx={{ ...theme.typography.h3, m: 0, flex: 1 }}><FormattedMessage id="lease.accounting.scheduleTitle" /></Box>
          <Button size="small" onClick={() => setShowAll((v) => !v)}><FormattedMessage id={showAll ? 'lease.accounting.showUpcoming' : 'lease.accounting.showAll'} values={{ count: a.schedule.length }} /></Button>
          <Button size="small" variant="outlined" startIcon={<Download size={14} aria-hidden />} onClick={exportSchedule}><FormattedMessage id="lease.accounting.exportCsv" /></Button>
        </Box>
        <Box tabIndex={0} role="region" aria-labelledby="acc-schedule" sx={{ overflow: 'auto', maxHeight: 480, border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface, '&:focus-visible': { outline: `2px solid ${t.focus}` } }}>
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
                    <Box component="td" sx={td} data-num><Money value={r.openingLiability} whole showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.payment} whole showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.interest} whole showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.closingLiability} whole showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={operating ? r.leaseCost : r.depreciation} whole showCode={false} /></Box>
                    <Box component="td" sx={td} data-num><Money value={r.closingRou} whole showCode={false} /></Box>
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="acc-journals">
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <Box component="h3" id="acc-journals" sx={{ ...theme.typography.h3, m: 0, flex: 1 }}><FormattedMessage id="lease.accounting.journalsTitle" values={{ year: a.thisYear.year }} /></Box>
          <TextField select size="small" value={journalKind} onChange={(e) => setJournalKind(e.target.value)} label={intl.formatMessage({ id: 'lease.accounting.journalKind' })} sx={{ minWidth: 200 }}>
            <MenuItem value="ALL"><FormattedMessage id="lease.accounting.journalAll" /></MenuItem>
            {kinds.map((k) => <MenuItem key={k} value={k}><FormattedMessage id={`lease.accounting.journal.${k}`} /></MenuItem>)}
          </TextField>
        </Box>
        {journals.length === 0 ? (
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}><FormattedMessage id="lease.accounting.noJournals" /></Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 3 }}>
            {journals.slice(0, 24).map((j, i) => (
              <Box key={`${j.date}-${j.kind}-${i}`} sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.surface }}>
                <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, borderBottom: `1px solid ${t.rule}`, fontSize: '0.8125rem' }}>
                  <Box component="span" data-num sx={{ fontWeight: 600 }}>{f.date(j.date)}</Box>
                  <Box component="span" sx={{ color: t.inkSecondary }}><FormattedMessage id={`lease.accounting.journal.${j.kind}`} /></Box>
                </Box>
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {j.lines.map((l, k) => (
                      <tr key={k}>
                        <Box component="td" sx={{ ...td, textAlign: 'start', paddingInlineStart: Number(l.credit.amount) > 0 ? 6 : 3 }}>
                          <Box component="span" data-num sx={{ color: t.inkTertiary, marginInlineEnd: 1.5 }}>{l.account}</Box>{l.accountName}
                        </Box>
                        <Box component="td" sx={td} data-num>{Number(l.debit.amount) > 0 ? <Money value={l.debit} showCode={false} /> : ''}</Box>
                        <Box component="td" sx={td} data-num>{Number(l.credit.amount) > 0 ? <Money value={l.credit} showCode={false} /> : ''}</Box>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
