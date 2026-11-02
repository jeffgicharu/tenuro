import { Suspense } from 'react';
import { graphql } from 'react-relay';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useScrollToTopOnNavigate } from './useScrollToTop.ts';
import type { RootQuery } from './__generated__/RootQuery.graphql';
import { LocaleTheme, TENURO_LOOK, type TenantLook } from './LocaleTheme.tsx';
import { queryLoader, useRouteQuery } from './relayRoute.ts';
import { AppShell } from '../shell/AppShell.tsx';
import { PageFallback } from '../shell/PageFallback.tsx';

export const rootQuery = graphql`
  query RootQuery {
    viewer {
      user { locale }
      tenant {
        locale
        languages
        theme { brandHue accentHue density }
      }
      ...AppShell_viewer
    }
  }
`;

export const rootLoader = queryLoader<RootQuery>(rootQuery);

const PUBLIC_PATHS = ['/sign-in'];

export function Root() {
  const { viewer } = useRouteQuery<RootQuery>(rootQuery);
  const { pathname } = useLocation();
  useScrollToTopOnNavigate(pathname);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!viewer && !isPublic) return <Navigate to="/sign-in" replace />;
  if (viewer && isPublic) return <Navigate to="/leases" replace />;

  const look: TenantLook = viewer
    ? {
        brandHue: viewer.tenant.theme.brandHue,
        accentHue: viewer.tenant.theme.accentHue,
        density: viewer.tenant.theme.density.toLowerCase() as TenantLook['density'],
        locale: viewer.tenant.locale,
        languages: viewer.tenant.languages,
      }
    : TENURO_LOOK;

  return (
    <Suspense fallback={null}>
      <LocaleTheme look={look} userLocale={viewer?.user.locale ?? null}>
        {viewer ? (
          <AppShell viewer={viewer}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </AppShell>
        ) : (
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        )}
      </LocaleTheme>
    </Suspense>
  );
}
