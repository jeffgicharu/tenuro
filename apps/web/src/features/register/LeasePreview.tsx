import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { useTheme } from '@mui/material/styles';
import { Money } from '../../components/Money.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { useFormat } from '../../i18n/format.ts';
import { FONT_MONO } from '../../theme/theme.ts';
import type { RegisterRow } from './columns.tsx';

// A glance at a lease from the register without leaving it: after a short hover on a row, or Space
// on the focused row. It is built from the row's own data, so it opens instantly, and it is purely
// informative (it takes no pointer events), so it never gets in the way of a click.
export function LeasePreview({ row, anchor }: { row: RegisterRow | null; anchor: HTMLElement | null }) {
  const theme = useTheme();
  const t = theme.tokens;
  const f = useFormat();
  const intl = useIntl();
  const open = Boolean(row && anchor?.isConnected);

  return (
    <Popper
      open={open}
      anchorEl={anchor}
      placement="bottom-start"
      // Visual only: its text reaches screen readers through the register's live region when opened
      // from the keyboard, so it is not a tooltip (MUI's default role for a Popper).
      role="presentation"
      aria-hidden
      modifiers={[{ name: 'offset', options: { offset: [8, 6] } }, { name: 'preventOverflow', options: { padding: 12 } }]}
      sx={{ zIndex: theme.zIndex.tooltip, pointerEvents: 'none' }}
    >
      {row && (
        <Paper
          elevation={0}
          sx={{
            width: 340, p: 4, border: `1px solid ${t.ruleStrong}`, borderRadius: 1.5, backgroundColor: t.surface,
            boxShadow: t.mode === 'dark' ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(60,45,20,0.16)',
            '@media (prefers-reduced-motion: no-preference)': { animation: 'tenuro-preview-in 140ms ease-out' },
            '@keyframes tenuro-preview-in': { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'none' } },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', color: t.inkSecondary }} dir="ltr">{row.reference}</Box>
            <StatusChip status={row.status} size="small" />
          </Box>
          <Box sx={{ mt: 1.5, fontFamily: theme.typography.h3.fontFamily, fontSize: '1.25rem', lineHeight: 1.25, color: t.ink }}>{row.propertyName}</Box>
          <Box sx={{ mt: 0.5, fontSize: '0.8125rem', color: t.inkSecondary }}>
            {[row.premises, row.district, row.city].filter(Boolean).join(' · ')}
          </Box>
          <Box component="dl" sx={{ m: 0, mt: 3, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1.5, fontSize: '0.8125rem', '& dt': { color: t.inkSecondary }, '& dd': { m: 0, color: t.ink } }}>
            <dt><FormattedMessage id="register.preview.landlord" /></dt>
            <dd>{row.landlordName}</dd>
            <dt><FormattedMessage id="register.preview.term" /></dt>
            <dd data-num>{f.date(row.commencementDate)} – {f.date(row.expiryDate)} <Box component="span" sx={{ color: t.inkSecondary }}>({f.relativeDays(row.daysToExpiry)})</Box></dd>
            <dt><FormattedMessage id="register.preview.rent" /></dt>
            <dd><Money value={row.annualRent} whole /></dd>
            <dt><FormattedMessage id="register.preview.area" /></dt>
            <dd data-num>{f.area(row.areaSqm)}</dd>
            {row.nextKeyDate && (
              <>
                <dt><FormattedMessage id="register.preview.next" /></dt>
                <dd data-num>{f.date(row.nextKeyDate)}{row.nextKeyKind ? ` · ${intl.formatMessage({ id: `keyDate.${row.nextKeyKind}` })}` : ''}</dd>
              </>
            )}
          </Box>
          <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${t.rule}`, fontSize: '0.75rem', color: t.inkSecondary }}>
            <FormattedMessage id="register.preview.open" />
          </Box>
        </Paper>
      )}
    </Popper>
  );
}
