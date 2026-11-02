import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useFormat } from '../i18n/format.ts';

export interface MoneyValue {
  readonly amount: string;
  readonly currency: string;
}

// Exact amount, tabular figures, negatives in accounting brackets. Direction is isolated so the
// currency code never jumps sides inside right-to-left text. Compact or whole amounts (tables) keep
// the exact figure, with its currency, in a tooltip; accounting screens show the exact figure.
export function Money({ value, compact = false, whole = false, showCode = true, sx }: {
  value: MoneyValue; compact?: boolean; whole?: boolean; showCode?: boolean; sx?: SxProps<Theme>;
}) {
  const f = useFormat();
  const rounded = compact || whole || !showCode;
  return (
    <Box component="bdi" data-num sx={{ whiteSpace: 'nowrap', ...sx }} title={rounded ? f.money(value.amount, value.currency) : undefined}>
      {f.money(value.amount, value.currency, { compact, whole, showCode })}
    </Box>
  );
}
