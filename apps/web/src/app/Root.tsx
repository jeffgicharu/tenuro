import { Suspense } from 'react';
import { graphql } from 'react-relay';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useScrollToTopOnNavigate } from './useScrollToTop.ts';
import type { RootQuery } from './__generated__/RootQuery.graphql';
import { LocaleTheme, TENURO_LOOK, type TenantLook } from './LocaleTheme.tsx';
import { queryLoader, useRouteQuery } from './relayRoute.ts';
import { AppShell } from '../shell/AppShell.tsx';
import { PageFallback } from '../shell/PageFallback.tsx';
import { BootShell } from '../shell/BootShell.tsx';

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
  // A signed-in person may open the sign-in page to switch company or role: it renders in Tenuro's
  // own look, outside the company shell, and offers to continue with the current account.
  const inShell = viewer != null && !isPublic;

  const look: TenantLook = viewer && inShell
    ? {
        brandHue: viewer.tenant.theme.brandHue,
        accentHue: viewer.tenant.theme.accentHue,
        density: viewer.tenant.theme.density.toLowerCase() as TenantLook['density'],
        locale: viewer.tenant.locale,
        languages: viewer.tenant.languages,
      }
    : TENURO_LOOK;

  return (
    <Suspense fallback={<BootShell />}>
      <LocaleTheme look={look} userLocale={inShell ? viewer.user.locale ?? null : null}>
        {inShell ? (
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
