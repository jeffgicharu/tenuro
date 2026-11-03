import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import Box from '@mui/material/Box';
import { useIntl } from 'react-intl';
import { MoneyInput, PercentInput } from './MoneyInput.tsx';

// Amounts typed as text and kept as exact decimals: grouping as you leave the field, the currency's
// minor units, never a float.
function Inputs() {
  const m = useIntl().formatMessage;
  const [rent, setRent] = useState('1250000');
  const [rate, setRate] = useState('8.5');
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 320 }}>
      <MoneyInput label={m({ id: 'leaseForm.field.rent.rentPerPeriod' })} currency="KES" value={rent} onChange={setRent} />
      <PercentInput label={m({ id: 'leaseForm.field.accounting.discountRatePercent' })} value={rate} onChange={setRate} />
      <code dir="ltr" style={{ fontSize: 12, justifySelf: 'start' }}>{JSON.stringify({ rent, rate })}</code>
    </Box>
  );
}
const meta = { title: 'Components/MoneyInput' } satisfies Meta;
export default meta;
export const Default: StoryObj = { render: () => <Inputs /> };
