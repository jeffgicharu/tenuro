import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { MockPayloadGenerator } from 'relay-test-utils';
import type { OperationDescriptor } from 'relay-runtime';
import { renderWithProviders } from '../test/render.tsx';
import CommandPalette from './CommandPalette.tsx';

function Where() {
  const l = useLocation();
  return <output aria-label="location">{l.pathname + l.search}</output>;
}

describe('command palette', () => {
  it('goes to a page with the arrow keys and Enter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<><CommandPalette open onClose={() => undefined} canEdit /><Where /></>, { route: '/' });
    const box = await screen.findByRole('combobox', { name: 'Search Tenuro' });
    expect(screen.getByRole('option', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    await user.type(box, '{ArrowDown}{Enter}');
    expect(screen.getByRole('status', { hidden: true, name: 'location' })).toHaveTextContent('/leases');
  });

  it('finds a lease by what was typed and opens it', async () => {
    const user = userEvent.setup();
    const { environment } = renderWithProviders(<><CommandPalette open onClose={() => undefined} canEdit={false} /><Where /></>, { route: '/' });
    expect(screen.queryByRole('option', { name: /New lease/ })).toBeNull();
    await user.type(await screen.findByRole('combobox'), 'Nyandiko');
    await waitFor(() => expect(environment.mock.getAllOperations().length).toBeGreaterThan(0));
    act(() => {
      environment.mock.resolveMostRecentOperation((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
        Lease: () => ({ id: 'lease-7', reference: 'KE-M-05242', propertyName: 'Nyandiko Plaza', city: 'Nairobi', status: 'ACTIVE' }),
        ViewerLeasesConnection: () => ({ edges: [{ node: { id: 'lease-7', reference: 'KE-M-05242', propertyName: 'Nyandiko Plaza', city: 'Nairobi', status: 'ACTIVE' } }] }),
      }));
    });
    await user.click(await screen.findByRole('option', { name: /KE-M-05242/ }));
    expect(screen.getByRole('status', { hidden: true, name: 'location' })).toHaveTextContent('/leases/lease-7');
  });

  it('offers to search the whole register for the text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<><CommandPalette open onClose={() => undefined} canEdit /><Where /></>, { route: '/' });
    await user.type(await screen.findByRole('combobox'), 'x');
    await user.click(screen.getByRole('option', { name: /Search the register for “x”/ }));
    expect(screen.getByRole('status', { hidden: true, name: 'location' })).toHaveTextContent('/leases?q=x');
  });
});
