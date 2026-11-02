import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import { Initials } from './Initials.tsx';

const meta = { title: 'Components/Initials', component: Initials, args: { text: 'OW', size: 32 } } satisfies Meta<typeof Initials>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Sizes: Story = { render: () => <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}><Initials text="WK" size={24} /><Initials text="OW" /><Initials text="را" size={44} /></Box> };
