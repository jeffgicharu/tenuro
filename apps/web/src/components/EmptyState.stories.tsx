import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import Button from '@mui/material/Button';
import { EmptyState } from './EmptyState.tsx';

// The copy comes from the app's own catalogues, so each language shows its real text.
function Story({ variant }: { variant: 'plain' | 'action' | 'alert' }) {
  const m = useIntl().formatMessage;
  if (variant === 'alert') {
    return <EmptyState role="alert" title={m({ id: 'register.error.title' })} body={m({ id: 'register.error.body' })} action={<Button variant="contained">{m({ id: 'common.retry' })}</Button>} />;
  }
  return <EmptyState title={m({ id: 'register.empty.title' })} body={m({ id: 'register.empty.body' })} {...(variant === 'action' ? { action: <Button variant="outlined">{m({ id: 'register.empty.clear' })}</Button> } : {})} />;
}

const meta = { title: 'Components/EmptyState' } satisfies Meta;
export default meta;
type S = StoryObj;
export const Default: S = { render: () => <Story variant="plain" /> };
export const WithAction: S = { render: () => <Story variant="action" /> };
export const AsAlert: S = { render: () => <Story variant="alert" /> };
