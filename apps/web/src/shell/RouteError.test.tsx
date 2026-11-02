import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RouteError } from './RouteError.tsx';

function Boom(): never {
  throw new Error('chunk failed to evaluate');
}

describe('RouteError', () => {
  it('renders without injecting <style> tags, so the strict CSP cannot strip its styling', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = document.head.querySelectorAll('style').length;
    const router = createMemoryRouter([{ path: '/', Component: Boom, ErrorBoundary: RouteError }]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Something went wrong.' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveStyle({ display: 'grid' });
    expect(document.head.querySelectorAll('style').length).toBe(before);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    // The error is reported, so a production failure can be diagnosed from the console.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: 'chunk failed to evaluate' }));
    spy.mockRestore();
  });

  // Regression: in an Arabic session the English text inherited right-to-left and its full stop
  // jumped to the wrong end ("Something went wrong." showed as ".Something went wrong").
  it('lays out each language in its own direction, even inside a right-to-left document', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.documentElement.dir = 'rtl';
    try {
      const router = createMemoryRouter([{ path: '/', Component: Boom, ErrorBoundary: RouteError }]);
      render(<RouterProvider router={router} />);
      const heading = await screen.findByRole('heading', { name: 'Something went wrong.' });
      expect(heading).toHaveAttribute('lang', 'en');
      expect(heading.closest('[role="alert"]')).toHaveAttribute('dir', 'ltr');
      expect(screen.getByText(/حدث خطأ/)).toHaveAttribute('dir', 'rtl');
    } finally {
      document.documentElement.dir = 'ltr';
      spy.mockRestore();
    }
  });
});
