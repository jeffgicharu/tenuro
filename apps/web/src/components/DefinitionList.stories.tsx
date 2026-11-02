import type { Meta, StoryObj } from '@storybook/react-vite';
import { DefinitionList, SectionHeading } from './DefinitionList.tsx';

const items = [
  { term: 'Landlord', value: 'Wanyika Estates Limited' },
  { term: 'Premises', value: 'Level 4, Wing B' },
  { term: 'Term', value: '5 years from 1 March 2024' },
  { term: 'Payment', value: 'Quarterly in advance' },
  { term: 'Rent review', value: 'Every 2 years to open market rent' },
  { term: 'Break option', value: 'Tenant only, 1 March 2027 on 6 months’ notice' },
];
const meta = { title: 'Components/DefinitionList', component: DefinitionList, args: { items, columns: 1 } } satisfies Meta<typeof DefinitionList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OneColumn: Story = { render: (args) => <><SectionHeading>Lease terms</SectionHeading><DefinitionList {...args} /></> };
export const TwoColumns: Story = { args: { columns: 2 } };
