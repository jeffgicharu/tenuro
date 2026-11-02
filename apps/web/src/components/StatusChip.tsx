import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useIntl } from 'react-intl';

export type LeaseStatus = 'ACTIVE' | 'HOLDING_OVER' | 'EXPIRED' | 'TERMINATED' | 'DRAFT';

// Each status has its own shape as well as colour and text, so it never relies on colour alone.
function Glyph({ status, color }: { status: LeaseStatus; color: string }) {
  const common = { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': true } as const;
  switch (status) {
    case 'ACTIVE':
      return <svg {...common}><circle cx="5" cy="5" r="4" fill={color} /></svg>;
    case 'HOLDING_OVER':
      return <svg {...common}><circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.5" /><path d="M5 1.5 A3.5 3.5 0 0 1 5 8.5 Z" fill={color} /></svg>;
    case 'EXPIRED':
      return <svg {...common}><circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.5" /></svg>;
    case 'TERMINATED':
      return <svg {...common}><circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.5" /><path d="M2.5 7.5 L7.5 2.5" stroke={color} strokeWidth="1.5" /></svg>;
    default:
      return <svg {...common}><circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.6" /></svg>;
  }
}

export function StatusChip({ status, size = 'medium' }: { status: LeaseStatus; size?: 'small' | 'medium' }) {
  const theme = useTheme();
  const intl = useIntl();
  const tone = theme.tokens.status[status];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 1.5, whiteSpace: 'nowrap',
        height: size === 'small' ? 22 : 24, px: size === 'small' ? 2 : 2.5, borderRadius: 1,
        backgroundColor: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem', fontWeight: 500, lineHeight: 1,
      }}
    >
      <Glyph status={status} color={tone.fg} />
      {intl.formatMessage({ id: `status.${status}` })}
    </Box>
  );
}
