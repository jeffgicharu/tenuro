import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import { StatusChip } from './StatusChip.tsx';

// A lease's status as text with a shape, never colour alone.
const meta = { title: 'Components/StatusChip', component: StatusChip, args: { status: 'ACTIVE', size: 'medium' },
  argTypes: { status: { control: 'select', options: ['ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED', 'DRAFT'] } } } satisfies Meta<typeof StatusChip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const AllStatuses: Story = {
  render: () => (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {(['ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED', 'DRAFT'] as const).map((s) => <StatusChip key={s} status={s} />)}
      {(['ACTIVE', 'HOLDING_OVER', 'EXPIRED'] as const).map((s) => <StatusChip key={`${s}-s`} status={s} size="small" />)}
    </Box>
  ),
};
