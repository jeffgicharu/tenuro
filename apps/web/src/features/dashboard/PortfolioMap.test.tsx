import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator } from 'relay-test-utils';
import type { OperationDescriptor } from 'relay-runtime';
import { renderWithProviders } from '../../test/render.tsx';
import type { PortfolioMapTestQuery } from './__generated__/PortfolioMapTestQuery.graphql';
import PortfolioMap from './PortfolioMap.tsx';

function Harness() {
  const data = useLazyLoadQuery<PortfolioMapTestQuery>(
    graphql`
      query PortfolioMapTestQuery @relay_test_operation {
        viewer { portfolio { ...PortfolioMap_portfolio } }
      }
    `,
    {},
  );
  return data.viewer ? <PortfolioMap portfolio={data.viewer.portfolio} /> : null;
}

const city = (name: string, country: string, lat: string, lng: string, share: string) => ({
  city: name, countryCode: country, latitude: lat, longitude: lng,
  rent: { leases: 100, share, passingRent: { amount: '1000000', currency: 'AED' } },
});

describe('portfolio map', () => {
  // Dubai, Sharjah and Abu Dhabi once printed their names on top of each other.
  it('labels the largest cities without letting labels collide, and lists every city as a link', async () => {
    const environment = createMockEnvironment();
    environment.mock.queueOperationResolver((op: OperationDescriptor) => MockPayloadGenerator.generate(op, {
      Portfolio: () => ({
        rentByCity: [
          city('Dubai', 'AE', '25.20', '55.27', '0.29'),
          city('Riyadh', 'SA', '24.71', '46.67', '0.24'),
          city('Sharjah', 'AE', '25.35', '55.42', '0.07'),
          city('Abu Dhabi', 'AE', '24.47', '54.37', '0.20'),
          city('Jeddah', 'SA', '21.49', '39.19', '0.08'),
        ],
      }),
    }));
    const { container } = renderWithProviders(<Suspense fallback="…"><Harness /></Suspense>, { environment });
    expect(await screen.findByRole('link', { name: /Sharjah/ })).toHaveAttribute('href', expect.stringContaining('city=Sharjah'));
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('Dubai');
    expect(labels).toContain('Riyadh');
    expect(labels).not.toContain('Sharjah');
    expect(container.querySelectorAll('svg circle')).toHaveLength(5);
  });
});
