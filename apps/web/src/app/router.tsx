import { createBrowserRouter, redirect } from 'react-router';
import { Root, rootLoader } from './Root.tsx';
import { RouteError } from '../shell/RouteError.tsx';
import { NotFound } from '../shell/NotFound.tsx';
import { BootShell } from '../shell/BootShell.tsx';
import { signInLoader } from '../features/signin/loader.ts';
import { registerLoader, registerShouldRevalidate } from '../features/register/loader.ts';
import { leaseLoader } from '../features/lease/loader.ts';
import { leaseFormLoader } from '../features/lease-form/loader.ts';

// Loaders are imported eagerly (they only reference small generated query artifacts) so data starts
// loading at once; each page's component code is a separate lazy chunk fetched in parallel.
export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    loader: rootLoader,
    Component: Root,
    ErrorBoundary: RouteError,
    HydrateFallback: BootShell,
    children: [
      { index: true, loader: () => redirect('/leases') },
      { path: 'sign-in', loader: signInLoader, lazy: { Component: async () => (await import('../features/signin/SignInPage.tsx')).SignInPage } },
      { path: 'leases', loader: registerLoader, shouldRevalidate: registerShouldRevalidate, lazy: { Component: async () => (await import('../features/register/RegisterPage.tsx')).RegisterPage } },
      { path: 'leases/new', loader: leaseFormLoader, lazy: { Component: async () => (await import('../features/lease-form/LeaseFormPage.tsx')).LeaseFormPage } },
      { path: 'leases/:leaseId', loader: leaseLoader, lazy: { Component: async () => (await import('../features/lease/LeasePage.tsx')).LeasePage } },
      { path: 'leases/:leaseId/amend', loader: leaseFormLoader, lazy: { Component: async () => (await import('../features/lease-form/LeaseFormPage.tsx')).LeaseFormPage } },
      { path: '*', Component: NotFound },
    ],
  },
]);
