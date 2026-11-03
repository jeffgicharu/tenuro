import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { SearchField } from './SearchField.tsx';

function Search() {
  const m = useIntl().formatMessage;
  const [value, setValue] = useState('');
  return <SearchField value={value} onChange={setValue} label={m({ id: 'register.search' })} placeholder={m({ id: 'register.searchPlaceholder' })} clearLabel={m({ id: 'common.clear' })} />;
}

const meta = { title: 'Components/SearchField' } satisfies Meta;
export default meta;
export const Default: StoryObj = { render: () => <Search /> };
