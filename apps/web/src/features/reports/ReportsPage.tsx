import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CalendarClock, FileSpreadsheet, FileText, Landmark, MapPinned, ScrollText, TimerReset, Wallet } from 'lucide-react';
import { downloadCsv } from '../../app/download.ts';
import { downloadXlsx, type Sheet } from '../../app/xlsx.ts';
import { useToast } from '../../shell/Toast.tsx';
import { buildReport, REPORTS, type ReportId } from './reports.ts';

const ICON: Record<ReportId, typeof ScrollText> = {
  register: ScrollText, rentRoll: Wallet, expiries: TimerReset, keyDates: CalendarClock, accounting: Landmark, locations: MapPinned,
};

// The standard reports a lease team sends on: each built from live data when asked for, as CSV
// (the report sheet) or an Excel workbook (every sheet, plus an About sheet saying what it is).
export function ReportsPage() {
  const theme = useTheme();
  const t = theme.tokens;
  const intl = useIntl();
  const toast = useToast();
  const [busy, setBusy] = useState<{ id: ReportId; format: 'csv' | 'xlsx'; done: number; total: number } | null>(null);

  const run = async (id: ReportId, format: 'csv' | 'xlsx') => {
    setBusy({ id, format, done: 0, total: 0 });
    try {
      const sheets = await buildReport(id, intl, (done, total) => setBusy((b) => (b ? { ...b, done, total } : b)));
      if (!sheets.length) throw new Error('empty');
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `${intl.formatMessage({ id: `reports.${id}.file` })}-${stamp}`;
      if (format === 'csv') downloadCsv(`${base}.csv`, sheets[0]!.rows);
      else {
        const about: Sheet = { name: intl.formatMessage({ id: 'reports.sheet.about' }), header: false, rows: [
          [intl.formatMessage({ id: `reports.${id}.title` })],
          [intl.formatMessage({ id: `reports.${id}.description` })],
          [],
          [intl.formatMessage({ id: 'reports.about.generated' }), new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
          [intl.formatMessage({ id: 'reports.about.rows' }), Math.max(0, sheets[0]!.rows.length - 1)],
          [intl.formatMessage({ id: 'reports.about.source' }), 'Tenuro'],
        ] };
        downloadXlsx(`${base}.xlsx`, [...sheets, about]);
      }
      toast.show(intl.formatMessage({ id: 'reports.ready' }, { title: intl.formatMessage({ id: `reports.${id}.title` }) }));
    } catch {
      toast.show(intl.formatMessage({ id: 'common.error' }), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box sx={{ px: { xs: 4, md: 8 }, pt: { xs: 5, md: 7 }, pb: 10, maxWidth: 1480 }}>
      <Box component="header" sx={{ mb: 6 }}>
        <Typography variant="h1"><FormattedMessage id="reports.title" /></Typography>
        <Box sx={{ mt: 1, fontSize: '0.875rem', color: t.inkSecondary }}><FormattedMessage id="reports.lede" /></Box>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        {REPORTS.map((id) => {
          const Icon = ICON[id];
          const mine = busy?.id === id;
          return (
            <Box component="li" key={id} sx={{ display: 'flex', flexDirection: 'column', border: `1px solid ${t.rule}`, borderRadius: 1.5, backgroundColor: t.surface, p: 5, position: 'relative', overflow: 'hidden',
              transition: 'border-color 140ms ease, box-shadow 140ms ease', '&:hover': { borderColor: t.ruleStrong, boxShadow: t.mode === 'dark' ? 'none' : '0 6px 20px -14px rgba(60,45,20,0.35)' } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mb: 3 }}>
                <Box aria-hidden sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 1, display: 'grid', placeItems: 'center', backgroundColor: t.brandSoft, color: t.brand }}><Icon size={20} strokeWidth={1.7} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box component="h2" id={`report-${id}`} sx={{ ...theme.typography.h3, m: 0, fontSize: '1.125rem' }}><FormattedMessage id={`reports.${id}.title`} /></Box>
                  <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary, mt: 0.5 }}><FormattedMessage id={`reports.${id}.description`} /></Box>
                </Box>
              </Box>
              <Box sx={{ flex: 1 }} />
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button size="small" variant="outlined" startIcon={<FileText size={15} aria-hidden />} onClick={() => void run(id, 'csv')} disabled={busy !== null} loading={mine && busy.format === 'csv'} aria-describedby={`report-${id}`}>CSV</Button>
                <Button size="small" variant="contained" startIcon={<FileSpreadsheet size={15} aria-hidden />} onClick={() => void run(id, 'xlsx')} disabled={busy !== null} loading={mine && busy.format === 'xlsx'} aria-describedby={`report-${id}`}>Excel</Button>
              </Box>
              {mine && (
                <Box role="status" sx={{ mt: 3, fontSize: '0.75rem', color: t.inkSecondary }}>
                  <LinearProgress variant={busy.total ? 'determinate' : 'indeterminate'} value={busy.total ? (busy.done / busy.total) * 100 : 0} sx={{ height: 3, borderRadius: 2, mb: 1 }} aria-hidden />
                  {busy.total > 1 ? <FormattedMessage id="reports.progress" values={{ done: busy.done, total: busy.total }} /> : <FormattedMessage id="reports.preparing" />}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
