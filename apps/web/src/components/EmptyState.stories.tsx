import type { Meta, StoryObj } from '@storybook/react-vite';
import Button from '@mui/material/Button';
import { EmptyState } from './EmptyState.tsx';

const meta = { title: 'Components/EmptyState', component: EmptyState, args: { title: 'No leases match these filters', body: 'Clear a filter to see more of the register.' } } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithAction: Story = { args: { action: <Button variant="outlined">Clear filters</Button> } };
export const AsAlert: Story = { args: { role: 'alert', title: 'The register could not load', body: 'Try again in a moment.', action: <Button variant="contained">Try again</Button> } };
