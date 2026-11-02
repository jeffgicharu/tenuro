import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

// A ruled "nothing here" panel in the ledger style: a few blank ledger lines instead of clip art.
export function EmptyState({ title, body, action, role }: { title: string; body?: string; action?: ReactNode; role?: 'status' | 'alert' }) {
  const t = useTheme().tokens;
  return (
    <Box role={role ?? 'status'} sx={{ py: { xs: 10, md: 14 }, px: 6, display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
      <Box aria-hidden sx={{ width: 120, mb: 6, display: 'grid', gap: 2 }}>
        {[1, 0.7, 0.85, 0.5].map((w, i) => (
          <Box key={i} sx={{ height: 0, borderTop: `1px ${i === 3 ? 'dashed' : 'solid'} ${t.ruleStrong}`, width: `${w * 100}%`, justifySelf: 'center' }} />
        ))}
      </Box>
      <Typography variant="h3" component="p" sx={{ mb: 2 }}>{title}</Typography>
      {body && <Typography color="text.secondary" sx={{ maxWidth: 420, mb: action ? 5 : 0 }}>{body}</Typography>}
      {action}
    </Box>
  );
}
