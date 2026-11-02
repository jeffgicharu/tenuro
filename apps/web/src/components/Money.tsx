import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useFormat } from '../i18n/format.ts';

export interface MoneyValue {
  readonly amount: string;
  readonly currency: string;
}

// Exact amount, tabular figures, negatives in accounting brackets. Direction is isolated so the
// currency code never jumps sides inside right-to-left text.
export function Money({ value, compact = false, sx }: { value: MoneyValue; compact?: boolean; sx?: SxProps<Theme> }) {
  const f = useFormat();
  return (
    <Box component="bdi" data-num sx={{ whiteSpace: 'nowrap', ...sx }} title={compact ? f.money(value.amount, value.currency) : undefined}>
      {f.money(value.amount, value.currency, { compact })}
    </Box>
  );
}
