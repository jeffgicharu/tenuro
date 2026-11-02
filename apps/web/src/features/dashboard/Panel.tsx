import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

// A dashboard section in the ledger style: a serif heading over a strong rule, a quiet lede, and
// an optional action at the heading's end. Sections are labelled regions for landmark navigation.
export function Panel({ title, lede, action, children }: { title: ReactNode; lede?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const t = theme.tokens;
  const id = useId();
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: t.surface, border: `1px solid ${t.rule}`, borderRadius: 1.5, p: { xs: 4, md: 6 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, pb: 3, mb: 4, borderBottom: `1px solid ${t.ruleStrong}` }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box component="h2" id={id} sx={{ ...theme.typography.h3, m: 0 }}>{title}</Box>
          {lede && <Box sx={{ mt: 0.5, fontSize: '0.8125rem', color: t.inkSecondary }}>{lede}</Box>}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}
