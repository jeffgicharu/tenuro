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
      <div><Money value={{ amount: '28789299.67', currency: 'KES' }} /></div>
      <div><Money value={{ amount: '28789299.67', currency: 'KES' }} whole showCode={false} /></div>
      <div><Money value={{ amount: '28789299.67', currency: 'KES' }} compact /></div>
      <div><Money value={{ amount: '819840000', currency: 'UGX' }} /></div>
      <div><Money value={{ amount: '-1250.5', currency: 'GBP' }} /></div>
      <div><Money value={{ amount: '3257542.5', currency: 'AED' }} /></div>
      <div><Money value={{ amount: '1820.125', currency: 'BHD' }} /></div>
    </Box>
  ),
};
