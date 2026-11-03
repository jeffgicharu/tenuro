import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

export interface Definition {
  term: ReactNode;
  value: ReactNode;
  key?: string;
}

// Label and value pairs set like a ledger: hairline rules, labels in the secondary ink.
export function DefinitionList({ items, columns = 1 }: { items: Definition[]; columns?: 1 | 2 }) {
  const t = useTheme().tokens;
  return (
    <Box
      component="dl"
      sx={{
        m: 0, display: 'grid', columnGap: 8,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' },
      }}
    >
      {items.map((item, i) => (
        <Box
          key={item.key ?? i}
          sx={{
            display: 'grid', gridTemplateColumns: 'minmax(132px, 40%) 1fr', gap: 4, py: 2.5,
            borderBottom: `1px solid ${t.rule}`, alignItems: 'baseline',
          }}
        >
          <Box component="dt" sx={{ color: t.inkSecondary, fontSize: '0.8125rem' }}>{item.term}</Box>
          <Box component="dd" sx={{ m: 0, color: t.ink, fontSize: '0.875rem', minWidth: 0, overflowWrap: 'anywhere' }}>{item.value}</Box>
        </Box>
      ))}
    </Box>
  );
}

export function SectionHeading({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4, mb: 2, pb: 2, borderBottom: `1px solid ${theme.tokens.ruleStrong}` }}>
      <Box component="h2" id={id} sx={{ ...theme.typography.h3, m: 0 }}>{children}</Box>
      {action}
    </Box>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  const t = useTheme().tokens;
  return <Box sx={{ py: 6, color: t.inkSecondary, fontSize: '0.875rem' }}>{children}</Box>;
}
