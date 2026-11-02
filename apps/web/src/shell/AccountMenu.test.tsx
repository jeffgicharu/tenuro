import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import { renderWithProviders } from '../test/render.tsx';
import type { AccountMenuTestQuery } from './__generated__/AccountMenuTestQuery.graphql';
import { AccountMenu } from './AccountMenu.tsx';

function Harness({ collapsed }: { collapsed: boolean }) {
  const data = useLazyLoadQuery<AccountMenuTestQuery>(
    graphql`
      query AccountMenuTestQuery @relay_test_operation {
        viewer { ...AccountMenu_viewer }
      }
    `,
    {},
  );
  return data.viewer ? <AccountMenu viewer={data.viewer} collapsed={collapsed} /> : null;
}

function renderMenu(collapsed: boolean) {
  const environment = createMockEnvironment();
  environment.mock.queueOperationResolver((op) =>
    MockPayloadGenerator.generate(op, {
      User: () => ({ id: 'u1', displayName: 'Otieno Wekesa', initials: 'OW', jobTitle: 'Lease manager', role: 'MANAGER' }),
      Tenant: () => ({ id: 't1', name: 'Mbuyu Court Holdings', nameLocal: null, languages: ['en', 'sw'] }),
    }),
  );
  renderWithProviders(<Suspense fallback="loading"><Harness collapsed={collapsed} /></Suspense>, { environment });
}

describe('account menu', () => {
  // Regression: the button was labelled "Account" while it showed the person's name and role, so
  // its accessible name did not contain its visible text (axe label-content-name-mismatch,
  // WCAG 2.5.3) and a speech user saying "Otieno Wekesa" could not open it.
  it('names its button with the visible name and role', async () => {
    renderMenu(false);
    expect(await screen.findByRole('button', { name: 'Otieno Wekesa Lease manager' })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('spells the person out when the rail is collapsed to initials', async () => {
    renderMenu(true);
    expect(await screen.findByRole('button', { name: 'Otieno Wekesa, Lease manager' })).toBeInTheDocument();
  });
});
