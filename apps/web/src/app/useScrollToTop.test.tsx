import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { useScrollToTopOnNavigate } from './useScrollToTop.ts';

function Page() {
  useScrollToTopOnNavigate(useLocation().pathname);
  return null;
}

describe('useScrollToTopOnNavigate', () => {
  // Regression: after saving the lease form, the lease page opened scrolled down to where the form was.
  it('scrolls to the top on a new page but not on back or forward', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const router = createMemoryRouter([{ path: '*', Component: Page }], { initialEntries: ['/leases/new'] });
    render(<RouterProvider router={router} />);
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => router.navigate('/leases/abc'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
    scrollTo.mockClear();
    await act(() => router.navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
