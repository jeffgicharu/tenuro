import { Suspense, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, RelayEnvironmentProvider, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import { IntlProvider } from 'react-intl';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { createAppTheme } from '../../theme/theme.ts';
import catalogue from '../../i18n/catalogues/en.ts';
import { ToastProvider } from '../../shell/Toast.tsx';
import type { LeaseRailTestQuery } from './__generated__/LeaseRailTestQuery.graphql';
import { LeaseRail } from './LeaseRail.tsx';
import { LeaseTasks } from './LeaseTasks.tsx';

function Harness() {
  const data = useLazyLoadQuery<LeaseRailTestQuery>(
    graphql`
      query LeaseRailTestQuery @relay_test_operation {
        node(id: "lease-1") {
          ... on Lease @alias(as: "lease") {
            ...LeaseRail_lease
            ...LeaseTasks_lease
          }
        }
      }
    `,
    {},
  );
  const lease = data.node?.lease;
  if (!lease) return null;
  return (
    <>
      <LeaseTasks lease={lease} canEdit />
      <aside aria-label="rail"><LeaseRail lease={lease} onOpen={() => undefined} /></aside>
    </>
  );
}

function Providers({ children, environment }: { children: ReactNode; environment: ReturnType<typeof createMockEnvironment> }) {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <IntlProvider locale="en-GB" messages={catalogue}>
        <ThemeProvider theme={createAppTheme({ brandHue: 138, accentHue: 70, density: 'standard' }, 'light', 'ltr')}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <ToastProvider>
              <Suspense fallback="loading">{children}</Suspense>
            </ToastProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </IntlProvider>
    </RelayEnvironmentProvider>
  );
}

describe('lease page rail', () => {
  it('updates its open-task count when a task is added, without a reload', async () => {
    const environment = createMockEnvironment();
    render(<Providers environment={environment}><Harness /></Providers>);

    environment.mock.resolveMostRecentOperation((op) =>
      MockPayloadGenerator.generate(op, {
        Lease: () => ({ id: 'lease-1', assignableUsers: [] }),
        LeaseKeyDatesConnection: () => ({ totalCount: 0, edges: [] }),
        LeaseTasksConnection: () => ({
          totalCount: 1,
          edges: [{ node: { id: 'task-1', title: 'Existing task', status: 'TODO', priority: 'NORMAL', dueOn: null, isOverdue: false, version: 1, assignee: null } }],
        }),
      }),
    );

    const rail = await screen.findByRole('complementary', { name: 'rail' });
    expect(rail).toHaveTextContent(/Open tasks\s*View all\s*1(?!\d)/);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Add task' })[0]!);
    await user.type(await screen.findByLabelText('What needs doing'), 'Request the service charge budget');
    await user.click(screen.getAllByRole('button', { name: 'Add task' }).at(-1)!);

    environment.mock.resolveMostRecentOperation((op) =>
      MockPayloadGenerator.generate(op, {
        MutationCreateTaskSuccess: () => ({ __typename: 'MutationCreateTaskSuccess' }),
        Task: () => ({ id: 'task-2', title: 'Request the service charge budget', status: 'TODO', priority: 'NORMAL', dueOn: null, isOverdue: false, version: 1 }),
        Lease: () => ({ id: 'lease-1' }),
        LeaseTasksConnection: () => ({ totalCount: 2, edges: [] }),
        LeaseKeyDatesConnection: () => ({ totalCount: 0, edges: [] }),
      }),
    );

    await waitFor(() => expect(rail).toHaveTextContent(/Open tasks\s*View all\s*2(?!\d)/));
    expect(screen.getByText('Request the service charge budget')).toBeInTheDocument();
  });
});
