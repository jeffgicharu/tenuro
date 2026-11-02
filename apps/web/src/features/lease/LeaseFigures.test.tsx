import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import { renderWithProviders } from '../../test/render.tsx';
import type { LeaseFiguresTestQuery } from './__generated__/LeaseFiguresTestQuery.graphql';
import { LeaseFigures } from './LeaseFigures.tsx';

function Harness() {
  const data = useLazyLoadQuery<LeaseFiguresTestQuery>(
    graphql`
      query LeaseFiguresTestQuery @relay_test_operation {
        node(id: "lease-1") {
          ... on Lease @alias(as: "lease") { ...LeaseFigures_lease }
        }
      }
    `,
    {},
  );
  return data.node?.lease ? <LeaseFigures lease={data.node.lease} /> : null;
}

describe('lease figures', () => {
  // Regression: each figure's detail line was a div beside the dt and dd, which a definition list
  // may not contain (axe definition-list, serious), so screen readers lost the term pairing.
  it('holds only dt and dd elements in each group, with the detail inside the value', async () => {
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver((op) =>
      MockPayloadGenerator.generate(op, {
        Lease: () => ({
          id: 'lease-1', annualRent: { amount: '1200000.00', currency: 'KES' }, annualRentReporting: { amount: '1200000.00', currency: 'KES' },
          commencementDate: '2024-01-01', expiryDate: '2029-12-31', termMonths: 72, daysToExpiry: 1150,
          nextKeyDate: null, nextKeyKind: null, areaSqm: '251', status: 'ACTIVE',
        }),
      }),
    );
    const { container } = renderWithProviders(<Suspense fallback="loading"><Harness /></Suspense>, { environment });
    await screen.findByText('Passing rent');
    const groups = [...container.querySelectorAll('dl > div')];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect([...group.children].map((c) => c.tagName)).toEqual(['DT', 'DD']);
    }
    expect(screen.getByText('a year').closest('dd')).not.toBeNull();
  });
});
