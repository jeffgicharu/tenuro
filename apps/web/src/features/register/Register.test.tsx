import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import type { Environment, OperationDescriptor } from 'relay-runtime';

type RelayMockEnvironment = ReturnType<typeof createMockEnvironment>;
import type { RegisterTestQuery } from './__generated__/RegisterTestQuery.graphql';
import { Providers } from '../../test/providers.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { RegisterView, type RegisterViewer } from './RegisterPage.tsx';

const query = graphql`
  query RegisterTestQuery @relay_test_operation {
    viewer {
      canEdit
      isAdmin
      tenant { name nameLocal reportingCurrency }
      ...RegisterGrid_viewer
      ...SavedViewsBar_viewer
    }
  }
`;

function Harness() {
  const data = useLazyLoadQuery<RegisterTestQuery>(query, {});
  return <RegisterView viewer={data.viewer as unknown as RegisterViewer} />;
}

const lease = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `TGVhc2U6${n}`, reference: `KE-O-0000${n}`, status: 'ACTIVE', propertyName: `Nyakoro House ${n}`, city: 'Nairobi',
  property: { district: 'Westlands' }, premises: 'Level 4, North', landlordName: 'Lakeri Holdings Limited',
  commencementDate: '2024-01-01', expiryDate: '2029-12-31', daysToExpiry: 1200,
  annualRentReporting: { amount: '1250000', currency: 'KES' }, annualRent: { amount: '1250000', currency: 'KES' },
  areaSqm: '420', nextKeyDate: '2027-01-01', nextKeyKind: 'RENT_REVIEW', propertyType: 'OFFICE', countryCode: 'KE',
  costCentre: null, changedInSandbox: false, ...extra,
});

const VIEW_CONFIG = JSON.stringify({ filters: { status: ['HOLDING_OVER'] }, sort: [{ field: 'ANNUAL_RENT', direction: 'DESC' }] });

function resolveInitial(env: RelayMockEnvironment, viewer: Partial<{ canEdit: boolean; isAdmin: boolean }> = {}) {
  act(() => {
    env.mock.resolveMostRecentOperation((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
      Viewer: () => ({ canEdit: true, isAdmin: false, ...viewer }),
      Tenant: () => ({ name: 'Mbuyu Court Holdings', nameLocal: null, reportingCurrency: 'KES' }),
      ViewerLeasesConnection: () => ({ totalCount: 2, edges: [{ cursor: 'a', node: lease(1) }, { cursor: 'b', node: lease(2, { status: 'HOLDING_OVER' }) }] }),
      ViewerSavedViewsConnection: () => ({
        edges: [{ cursor: 'v', node: { id: 'U2F2ZWRWaWV3OjE=', name: 'Holding over', shared: true, config: VIEW_CONFIG } }],
      }),
      PageInfo: () => ({ hasNextPage: false, endCursor: 'b' }),
    }));
  });
}

function setup(path = '/leases') {
  const env = createMockEnvironment();
  render(
    <Providers environment={env as unknown as Environment} initialPath={path}>
      <Suspense fallback={<p>loading</p>}>
        <Harness />
      </Suspense>
    </Providers>,
  );
  return env;
}

// The latest pending operation with this name; several queries can start from one interaction.
const lastOperation = (env: RelayMockEnvironment, name = 'RegisterGridPaginationQuery') => {
  const op = [...env.mock.getAllOperations()].reverse().find((o) => o.request.node.operation.name === name);
  if (!op) throw new Error(`no pending ${name}`);
  return op;
};

beforeEach(() => {
  (window as unknown as { __narrow?: boolean }).__narrow = true;
});
afterEach(() => {
  (window as unknown as { __narrow?: boolean }).__narrow = false;
});

describe('lease register', () => {
  it('renders the leases from the connection with their status', async () => {
    const env = setup();
    resolveInitial(env);
    const list = await screen.findByRole('list', { name: 'Lease register' });
    expect(within(list).getByText('KE-O-00001')).toBeInTheDocument();
    expect(within(list).getByText('Nyakoro House 2')).toBeInTheDocument();
    expect(within(list).getByText('Holding over')).toBeInTheDocument();
    expect(screen.getByText('2 leases')).toBeInTheDocument();
  });

  it('refetches with the new filter when a filter is turned on', async () => {
    const user = userEvent.setup();
    const env = setup();
    resolveInitial(env);
    await user.click(await screen.findByRole('button', { name: 'Open break option' }));
    const op = lastOperation(env);
    expect(op.request.node.operation.name).toBe('RegisterGridPaginationQuery');
    expect(op.request.variables).toMatchObject({ first: 100, filter: { hasOpenBreak: true } });
  });

  it('filters by status from the facet list', async () => {
    const user = userEvent.setup();
    const env = setup();
    resolveInitial(env);
    await user.click(await screen.findByRole('button', { name: 'Status' }));
    act(() => {
      env.mock.resolveMostRecentOperation((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
        LeaseFacets: () => ({ status: [{ value: 'ACTIVE', count: 8467 }, { value: 'EXPIRED', count: 967 }], countryCode: [], city: [], propertyType: [], currency: [] }),
      }));
    });
    await user.click(await screen.findByRole('checkbox', { name: /Active/ }));
    const op = lastOperation(env);
    expect(op.request.node.operation.name).toBe('RegisterGridPaginationQuery');
    expect(op.request.variables.filter).toEqual({ status: ['ACTIVE'] });
  });

  it('applies a saved view: its filters and its sort', async () => {
    const user = userEvent.setup();
    const env = setup();
    resolveInitial(env);
    await user.click(await screen.findByRole('tab', { name: /Holding over/ }));
    const op = lastOperation(env);
    expect(op.request.variables).toMatchObject({ filter: { status: ['HOLDING_OVER'] }, orderBy: [{ field: 'ANNUAL_RENT', direction: 'DESC' }] });
    expect(screen.getByRole('tab', { name: /Holding over/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a newly saved view straight away, before the server answers', async () => {
    const user = userEvent.setup();
    const env = setup();
    resolveInitial(env);
    await user.click(await screen.findByRole('button', { name: 'Save view' }));
    await user.type(screen.getByLabelText('Name'), 'Nairobi retail');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(lastOperation(env, 'SavedViewsBarSaveMutation')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Nairobi retail/ })).toBeInTheDocument();
  });

  it('offers "New lease" to managers but not to read-only viewers', async () => {
    const env = setup();
    resolveInitial(env, { canEdit: false });
    await screen.findByRole('list', { name: 'Lease register' });
    expect(screen.queryByRole('link', { name: 'New lease' })).toBeNull();
  });

  it('offers "New lease" when the role can edit', async () => {
    const env = setup();
    resolveInitial(env, { canEdit: true });
    expect(await screen.findByRole('link', { name: 'New lease' })).toHaveAttribute('href', '/leases/new');
  });
});

describe('StatusChip', () => {
  it('names the status in text and keeps its shape decorative', () => {
    const env = createMockEnvironment();
    render(<Providers environment={env as unknown as Environment}><StatusChip status="HOLDING_OVER" /></Providers>);
    const label = screen.getByText('Holding over');
    expect(label).toBeVisible();
    expect(label.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
