import { Link as RouterLink } from 'react-router';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { Money } from '../../components/Money.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import type { RegisterRow } from './columns.tsx';

// The register on small screens: one ruled entry per lease, same data and order as the grid.
export function RegisterCards({ rows }: { rows: readonly RegisterRow[] }) {
  const t = useTheme().tokens;
  const f = useFormat();
  const intl = useIntl();
  return (
    <Box component="ul" aria-label={intl.formatMessage({ id: 'register.gridLabel' })} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.rule}` }}>
      {rows.map((r) => {
        const soon = r.daysToExpiry >= 0 && r.daysToExpiry < 90 && r.status !== 'EXPIRED' && r.status !== 'TERMINATED';
        return (
          <Box component="li" key={r.id} sx={{ borderBottom: `1px solid ${t.rule}` }}>
            <Box
              component={RouterLink}
              to={`/leases/${encodeURIComponent(r.id)}`}
              sx={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, px: 4, py: 3.5, color: 'inherit', textDecoration: 'none',
                '&:hover, &:focus-visible': { backgroundColor: t.brandTint }, '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', color: t.inkSecondary, direction: 'ltr', textAlign: 'start' }}>{r.reference}</Box>
                <Box sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.propertyName}</Box>
                <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>{r.premises} · {r.city}</Box>
              </Box>
              <Box sx={{ justifySelf: 'end' }}><StatusChip status={r.status} size="small" /></Box>
              <Box sx={{ fontSize: '0.8125rem', color: soon ? t.warning : t.inkSecondary, fontWeight: soon ? 600 : 400 }} data-num>
                {f.date(r.expiryDate)} · {f.relativeDays(r.daysToExpiry)}
              </Box>
              <Box sx={{ justifySelf: 'end', fontSize: '0.875rem', fontWeight: 500 }}>
                <Money value={r.annualRentReporting} compact />
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
