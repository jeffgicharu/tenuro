import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import type { OperationDescriptor } from 'relay-runtime';
import { renderWithProviders } from '../../test/render.tsx';
import type { KeyDateListTestQuery } from './__generated__/KeyDateListTestQuery.graphql';
import { KeyDateList } from './KeyDateList.tsx';

function Harness({ canEdit }: { canEdit: boolean }) {
  const data = useLazyLoadQuery<KeyDateListTestQuery>(
    graphql`
      query KeyDateListTestQuery @relay_test_operation {
        viewer { ...KeyDateList_viewer }
      }
    `,
    {},
  );
  return data.viewer ? <KeyDateList viewer={data.viewer} filter={{}} canEdit={canEdit} /> : null;
}

const node = { id: 'kd-1', kind: 'RENT_REVIEW', title: 'Rent review', dueOn: '2027-01-15', daysUntil: 74, status: 'UPCOMING', version: 3, remindDays: [30, 7],
  owner: { id: 'u-1', displayName: 'Otieno Wekesa', initials: 'OW' }, lease: { id: 'l-1', reference: 'KE-O-00012', propertyName: 'Nyandiko Plaza', city: 'Nairobi' } };

describe('key date list', () => {
  // Marking a date done is one click, shown at once, and Undo puts it back.
  it('marks a date done straight away and Undo reopens it', async () => {
    const user = userEvent.setup();
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
      ViewerKeyDatesConnection: () => ({ totalCount: 1, edges: [{ node }], pageInfo: { hasNextPage: false, endCursor: null } }),
    }));
    renderWithProviders(<Suspense fallback="…"><Harness canEdit /></Suspense>, { environment });
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    const op = environment.mock.getMostRecentOperation();
    expect(op.request.variables.input).toEqual({ id: 'kd-1', version: 3, status: 'ACTIONED' });
    expect(screen.getByText('Done', { selector: 'div' })).toBeInTheDocument();
    act(() => {
      environment.mock.resolve(op, { data: { updateKeyDate: { __typename: 'MutationUpdateKeyDateSuccess', data: { keyDate: { id: 'kd-1', status: 'ACTIONED', version: 4, remindDays: [30, 7] } } } } });
    });
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(environment.mock.getMostRecentOperation().request.variables.input).toEqual({ id: 'kd-1', version: 4, status: 'UPCOMING' }));
  });

  it('offers no actions to a read-only viewer', async () => {
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
      ViewerKeyDatesConnection: () => ({ totalCount: 1, edges: [{ node }], pageInfo: { hasNextPage: false, endCursor: null } }),
    }));
    renderWithProviders(<Suspense fallback="…"><Harness canEdit={false} /></Suspense>, { environment });
    expect(await screen.findByText('KE-O-00012')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});
