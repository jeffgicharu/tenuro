import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchField } from './SearchField.tsx';

function Search() {
  const [value, setValue] = useState('');
  return <><SearchField value={value} onChange={setValue} label="Search leases" placeholder="Reference, property, landlord, city…" clearLabel="Clear" /><p style={{ fontSize: 13 }}>Debounced value: <code>{value || '—'}</code></p></>;
}
const meta = { title: 'Components/SearchField' } satisfies Meta;
export default meta;
export const Default: StoryObj = { render: () => <Search /> };
