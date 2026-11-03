import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useFormat } from '../i18n/format.ts';
import type { MoneyValue } from './Money.tsx';

// A headline or KPI figure: compact (KES 115.4B), so it always fits its tile, with the exact amount
// in a tooltip that pointer and keyboard users can both open (the figure takes focus), and given to
// screen readers as its description. Tables, schedules and exports keep the exact minor unit.
export function CompactMoney({ value, showCode = true }: { value: MoneyValue; showCode?: boolean }) {
  const f = useFormat();
  const exact = f.money(value.amount, value.currency);
  const short = f.money(value.amount, value.currency, { compact: true, showCode });
  if (short === exact) return <Box component="bdi" data-num sx={{ whiteSpace: 'nowrap' }}>{exact}</Box>;
  return (
    <Tooltip title={exact} describeChild placement="top">
      <Box
        component="bdi"
        data-num
        tabIndex={0}
        sx={{
          whiteSpace: 'nowrap', borderRadius: 0.5, cursor: 'help',
          textDecoration: 'underline dotted', textDecorationThickness: '1px', textUnderlineOffset: '0.2em', textDecorationColor: 'currentColor',
          '&:focus-visible': { outline: (t) => `2px solid ${t.tokens.focus}`, outlineOffset: 2 },
        }}
      >
        {short}
      </Box>
    </Tooltip>
  );
}
