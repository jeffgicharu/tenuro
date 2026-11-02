import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';

// Shaped like the loaded register (views, filters, ruled rows) so nothing jumps when data arrives.
export function RegisterSkeleton() {
  const t = useTheme().tokens;
  const intl = useIntl();
  const widths = [0.12, 0.26, 0.16, 0.2, 0.1, 0.12];
  return (
    <Box role="status" aria-label={intl.formatMessage({ id: 'app.loading' })} sx={{ display: 'grid', gap: 4 }}>
      <Box sx={{ display: 'flex', gap: 5, borderBottom: `1px solid ${t.rule}`, pb: 2.5 }}>
        {[90, 120, 140, 110].map((w) => <Skeleton key={w} width={w} height={18} />)}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Skeleton variant="rounded" width={320} height={36} />
        {[78, 84, 64, 96, 72].map((w) => <Skeleton key={w} variant="rounded" width={w} height={32} />)}
      </Box>
      <Box sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, overflow: 'hidden', backgroundColor: t.surface }}>
        <Box sx={{ height: t.rowHeight + 4, backgroundColor: t.sunken, borderBottom: `1px solid ${t.rule}` }} />
        {Array.from({ length: 12 }, (_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 6, alignItems: 'center', height: t.rowHeight + 14, px: 4, borderBottom: `1px solid ${t.rule}` }}>
            {widths.map((w, j) => <Skeleton key={j} height={14} sx={{ flex: `0 0 ${w * 100}%`, opacity: 1 - i * 0.06 }} />)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
