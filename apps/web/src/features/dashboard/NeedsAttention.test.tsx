import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import type { OperationDescriptor } from 'relay-runtime';
import { renderWithProviders } from '../../test/render.tsx';
import type { NeedsAttentionTestQuery } from './__generated__/NeedsAttentionTestQuery.graphql';
import { NeedsAttention } from './NeedsAttention.tsx';

function Harness({ canEdit }: { canEdit: boolean }) {
  const data = useLazyLoadQuery<NeedsAttentionTestQuery>(
    graphql`
      query NeedsAttentionTestQuery @relay_test_operation {
        viewer { portfolio { ...NeedsAttention_portfolio } }
      }
    `,
    {},
  );
  return data.viewer ? <NeedsAttention portfolio={data.viewer.portfolio} canEdit={canEdit} userId="user-1" /> : null;
}

const resolver = (op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
  Portfolio: () => ({
    attentionBuckets: [
      { withinDays: 0, fromDays: null, count: 3, rentAtStake: { amount: '1200000', currency: 'KES' } },
      { withinDays: 30, fromDays: 0, count: 12, rentAtStake: { amount: '9000000', currency: 'KES' } },
      { withinDays: 60, fromDays: 31, count: 8, rentAtStake: { amount: '15000000', currency: 'KES' } },
      { withinDays: 90, fromDays: 61, count: 11, rentAtStake: { amount: '22000000', currency: 'KES' } },
    ],
    attention: [
      { hasOpenTask: false, rentAtStake: { amount: '4800000', currency: 'KES' }, keyDate: { id: 'kd-1', kind: 'BREAK_NOTICE', dueOn: '2026-10-28', daysUntil: -5, lease: { id: 'lease-1', reference: 'KE-O-00012', propertyName: 'Nyandiko Plaza', city: 'Nairobi' } } },
      { hasOpenTask: true, rentAtStake: { amount: '2100000', currency: 'KES' }, keyDate: { id: 'kd-2', kind: 'RENT_REVIEW', dueOn: '2026-11-20', daysUntil: 18, lease: { id: 'lease-2', reference: 'KE-R-00044', propertyName: 'Malindio Plaza', city: 'Mombasa' } } },
    ],
  }),
});

describe('needs attention', () => {
  it('leads with overdue decisions in red, with the rent at stake', async () => {
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver(resolver);
    renderWithProviders(<Suspense fallback="…"><Harness canEdit /></Suspense>, { environment });
    const panel = await screen.findByRole('region', { name: 'Needs attention' });
    expect(within(panel).getByText('Overdue by 5 days')).toBeInTheDocument();
    expect(within(panel).getByText('Decisions overdue')).toBeInTheDocument();
    expect(within(panel).getByText('Due in 31–60 days')).toBeInTheDocument();
    expect(within(panel).getByText('Task open')).toBeInTheDocument();
  });

  // The row's action creates a task at once (optimistically), and the toast's Undo cancels it.
  it('creates a task from a row, and Undo cancels it', async () => {
    const user = userEvent.setup();
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver(resolver);
    renderWithProviders(<Suspense fallback="…"><Harness canEdit /></Suspense>, { environment });
    await user.click(await screen.findByRole('button', { name: 'Create task' }));
    expect(screen.getByText('Creating task…')).toBeInTheDocument();
    const create = environment.mock.getMostRecentOperation();
    expect(create.request.node.operation.name).toBe('NeedsAttentionCreateTaskMutation');
    expect(create.request.variables.input).toMatchObject({ keyDateId: 'kd-1', leaseId: 'lease-1', assigneeId: 'user-1', priority: 'HIGH' });
    act(() => {
      environment.mock.resolve(create, { data: { createTask: { __typename: 'MutationCreateTaskSuccess', data: { task: { id: 'task-9', version: 1 } } } } });
    });
    expect(await screen.findByText('Task created for KE-O-00012, assigned to you.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(environment.mock.getMostRecentOperation().request.node.operation.name).toBe('NeedsAttentionCancelTaskMutation'));
    expect(environment.mock.getMostRecentOperation().request.variables.input).toEqual({ id: 'task-9', version: 1, status: 'CANCELLED' });
    expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument();
  });

  it('offers no task action to a read-only viewer', async () => {
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver(resolver);
    renderWithProviders(<Suspense fallback="…"><Harness canEdit={false} /></Suspense>, { environment });
    await screen.findByRole('region', { name: 'Needs attention' });
    expect(screen.queryByRole('button', { name: 'Create task' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Open' }).length).toBeGreaterThan(0);
  });
});
