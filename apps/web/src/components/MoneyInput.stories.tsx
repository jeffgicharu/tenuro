import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import Box from '@mui/material/Box';
import { MoneyInput, PercentInput } from './MoneyInput.tsx';

// Amounts typed as text and kept as exact decimals: grouping as you leave the field, the currency's
// minor units, never a float.
function Inputs() {
  const [rent, setRent] = useState('1250000');
  const [rate, setRate] = useState('8.5');
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 320 }}>
      <MoneyInput label="Rent per period" currency="KES" value={rent} onChange={setRent} />
      <PercentInput label="Discount rate" value={rate} onChange={setRate} />
      <code style={{ fontSize: 12 }}>{JSON.stringify({ rent, rate })}</code>
    </Box>
  );
}
const meta = { title: 'Components/MoneyInput' } satisfies Meta;
export default meta;
export const Default: StoryObj = { render: () => <Inputs /> };
