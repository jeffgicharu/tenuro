import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import type { OperationDescriptor } from 'relay-runtime';
import { emptyLeaseForm } from '@tenuro/lease-rules';
import type { LeaseFormEditorTestQuery } from './__generated__/LeaseFormEditorTestQuery.graphql';
import { LeaseFormEditor, type EditorProps } from './LeaseFormEditor.tsx';
import { validLease } from './test-fixtures.ts';
import { renderWithProviders } from '../../test/render.tsx';

const testQuery = graphql`
  query LeaseFormEditorTestQuery @relay_test_operation {
    viewer { ...PropertyPicker_viewer }
  }
`;

function Harness(props: Omit<EditorProps, 'viewer'>) {
  const data = useLazyLoadQuery<LeaseFormEditorTestQuery>(testQuery, {});
  return <LeaseFormEditor {...props} viewer={data.viewer!} />;
}

const isMutation = (op: OperationDescriptor) => op.request.node.params.operationKind === 'mutation';

// Queries resolve automatically with generated data; mutations stay pending until a test resolves them.
function setup(props: Partial<Omit<EditorProps, 'viewer'>> = {}) {
  const environment = createMockEnvironment();
  environment.mock.queueOperationResolver((op) => (isMutation(op) ? undefined : MockPayloadGenerator.generate(op, {
    Property: () => ({ id: 'UHJvcGVydHk6MTIz', name: 'Kesingo Court', code: 'KE-0001', city: 'Nairobi', district: 'Westlands', type: 'OFFICE', countryCode: 'KE' }),
  })) as never);
  const template = emptyLeaseForm({ currency: 'KES', lesseeEntity: 'Mbuyu Court Holdings (Kenya) Limited' });
  const merged: Omit<EditorProps, 'viewer'> = {
    mode: 'new', template, initialData: template, initialStep: 'parties', original: null, lease: null, draft: null, ...props,
  };
  const utils = renderWithProviders(<Suspense fallback="loading"><Harness {...merged} /></Suspense>, { environment });
  return { ...utils, environment };
}

async function pendingMutation(environment: ReturnType<typeof createMockEnvironment>, name: string) {
  let found: OperationDescriptor | undefined;
  await waitFor(() => {
    found = environment.mock.getAllOperations().find((op) => op.request.node.params.name === name);
    expect(found).toBeDefined();
  }, { timeout: 4000 });
  return found!;
}

describe('LeaseFormEditor', () => {
  it('blocks Continue on an incomplete step and lists what needs fixing', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Parties', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: /continue to property/i }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText(/thing needs attention in this section/i)).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: /landlord name: this is required/i })).toHaveAttribute('href', '#lf-parties-landlord-name');
    expect(screen.getByRole('heading', { name: 'Parties', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /landlord name/i })).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a cross-step error on the step where it must be fixed', async () => {
    const data = validLease();
    data.options[0]!.exerciseOn = '2033-01-01';
    data.options[0]!.noticeBy = '2032-06-01';
    setup({ initialData: data, initialStep: 'options' });
    await screen.findByRole('heading', { name: 'Options', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: /continue to deposits/i }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText(/this must fall within the lease term/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Options', level: 2 })).toBeInTheDocument();
  });

  it('maps the server’s field errors back to their step and field', async () => {
    const { environment } = setup({ initialData: validLease(), initialStep: 'review' });
    await screen.findByRole('heading', { name: 'Review', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: /create lease/i }));
    const op = await pendingMutation(environment, 'LeaseFormEditorSubmitMutation');
    // An explicit payload: the generator cannot pick a union member for an operation that is not
    // marked as a test operation.
    act(() => {
      environment.mock.resolve(op, {
        data: {
          submitLease: {
            __typename: 'ValidationFailed', message: 'x',
            fieldErrors: [{ path: 'term.expiryDate', code: 'outside_term', message: 'Outside the term', step: 'term' }],
          },
        },
      });
    });
    await screen.findByRole('heading', { name: 'Term', level: 2 });
    expect(screen.getByText(/the server found 1 problem/i)).toBeInTheDocument();
    expect(screen.getAllByText(/this must fall within the lease term/i).length).toBeGreaterThan(0);
  });

  it('autosaves a draft with the version it was loaded at', async () => {
    const { environment } = setup({ mode: 'resume', draft: { id: 'TGVhc2VEcmFmdDox', version: 3, updatedAt: '2026-11-02T08:00:00Z' } });
    await userEvent.type(await screen.findByRole('textbox', { name: /landlord name/i }), 'Nyakoro');
    const op = await pendingMutation(environment, 'useAutosaveSaveDraftMutation');
    const input = op.request.variables.input as { id: string; version: number; currentStep: string; data: string };
    expect(input).toMatchObject({ id: 'TGVhc2VEcmFmdDox', version: 3, currentStep: 'parties' });
    expect(JSON.parse(input.data).parties.landlord.name).toBe('Nyakoro');
  });

  it('asks what to do when the draft was changed elsewhere', async () => {
    const { environment } = setup({ mode: 'resume', draft: { id: 'TGVhc2VEcmFmdDox', version: 3, updatedAt: '2026-11-02T08:00:00Z' } });
    await userEvent.type(await screen.findByRole('textbox', { name: /landlord name/i }), 'N');
    const op = await pendingMutation(environment, 'useAutosaveSaveDraftMutation');
    act(() => {
      environment.mock.resolve(op, { data: { saveLeaseDraft: { __typename: 'StaleVersion', message: 'stale', currentVersion: 5 } } });
    });
    const dialog = await screen.findByRole('dialog', { name: /someone changed this since you opened it/i });
    expect(within(dialog).getByRole('button', { name: /keep my version/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /load the newer version/i })).toBeInTheDocument();
  });

  // Regression: the two buttons sat in separate grid columns, so "Add an agent" floated mid-row.
  it('keeps the add-guarantor and add-agent buttons together', async () => {
    setup();
    const guarantor = await screen.findByRole('button', { name: /add a guarantor/i });
    const agent = screen.getByRole('button', { name: /add an agent/i });
    expect(guarantor.parentElement).toBe(agent.parentElement);
    expect(getComputedStyle(guarantor.parentElement!).display).toBe('flex');
  });

  it('opens the step named in the hash when only the hash changes', async () => {
    setup({ initialData: validLease() });
    await screen.findByRole('heading', { name: 'Parties', level: 2 });
    act(() => {
      window.history.replaceState(null, '', '/leases/new#rent');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Rent', level: 2 })).toBeInTheDocument();
  });

  it('says "Section n of 8" once on narrow screens', async () => {
    (window as unknown as { __narrow?: boolean }).__narrow = true;
    try {
      setup();
      await screen.findByRole('heading', { name: 'Parties', level: 2 });
      expect(screen.getAllByText('Section 1 of 8')).toHaveLength(1);
    } finally {
      (window as unknown as { __narrow?: boolean }).__narrow = false;
    }
  });

  it('does not show a zero count when an amendment has no changes yet', async () => {
    const original = validLease();
    setup({ mode: 'amend', original, initialData: structuredClone(original), initialStep: 'review', lease: { id: 'TGVhc2U6MQ==', reference: 'KE-O-00001', version: 4 } });
    const changes = await screen.findByRole('region', { name: /what changes/i });
    expect(within(changes).getByText(/nothing has changed yet/i)).toBeInTheDocument();
    expect(within(changes).queryByText(/0 fields/i)).toBeNull();
  });

  // Regression: after a successful save the button went idle while the lease page loaded, so the
  // form looked stuck under the "created" notice.
  it('keeps the save button busy after a successful save, until the lease page takes over', async () => {
    const { environment } = setup({ initialData: validLease(), initialStep: 'review' });
    await userEvent.click(await screen.findByRole('button', { name: /create lease/i }));
    const op = await pendingMutation(environment, 'LeaseFormEditorSubmitMutation');
    act(() => {
      environment.mock.resolve(op, { data: { submitLease: { __typename: 'MutationSubmitLeaseSuccess', data: { lease: { id: 'TGVhc2U6bmV3', reference: 'KE-O-10001' } } } } });
    });
    expect(await screen.findByText(/lease KE-O-10001 created/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows every changed field before an amendment is saved', async () => {
    const original = validLease();
    const edited = structuredClone(original);
    edited.rent.rentPerPeriod = '1300000';
    setup({ mode: 'amend', original, initialData: edited, initialStep: 'review', lease: { id: 'TGVhc2U6MQ==', reference: 'KE-O-00001', version: 4 } });
    const changes = await screen.findByRole('region', { name: /what changes/i });
    expect(within(changes).getByText('1 field changes')).toBeInTheDocument();
    const row = within(changes).getByRole('row', { name: /rent per payment/i });
    expect(within(row).getByText(/1,250,000\.00/)).toBeInTheDocument();
    expect(within(row).getByText(/1,300,000\.00/)).toBeInTheDocument();
  });
});
