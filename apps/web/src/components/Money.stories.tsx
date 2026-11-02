import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import { Money } from './Money.tsx';

// Exact amounts with the currency's minor units; compact and whole forms keep the exact figure in a
// tooltip. Direction is isolated, so the code stays put in right-to-left text.
const meta = { title: 'Components/Money', component: Money, args: { value: { amount: '28789299.67', currency: 'KES' }, compact: false, whole: false, showCode: true } } satisfies Meta<typeof Money>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Exact: Story = {};
export const Forms: Story = {
  render: () => (
    <Box sx={{ display: 'grid', gap: 1.5, fontSize: '1rem' }}>
      <Money value={{ amount: '28789299.67', currency: 'KES' }} />
      <Money value={{ amount: '28789299.67', currency: 'KES' }} whole showCode={false} />
      <Money value={{ amount: '28789299.67', currency: 'KES' }} compact />
      <Money value={{ amount: '819840000', currency: 'UGX' }} />
      <Money value={{ amount: '-1250.5', currency: 'GBP' }} />
      <Money value={{ amount: '3257542.5', currency: 'AED' }} />
      <Money value={{ amount: '1820.125', currency: 'BHD' }} />
    </Box>
  ),
};
