import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { graphql, useFragment } from 'react-relay';
import { NavLink, useLocation } from 'react-router';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { styled, useTheme } from '@mui/material/styles';
import ButtonBase from '@mui/material/ButtonBase';
import { CalendarClock, FilePlus2, LayoutDashboard, LogOut, Menu, Search, PanelLeftClose, PanelLeftOpen, ScrollText } from 'lucide-react';
import { signOut } from '../app/session.ts';
import type { AppShell_viewer$key } from './__generated__/AppShell_viewer.graphql';
import { usePreferences } from '../app/preferences.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { SessionBanner } from './SessionBanner.tsx';
import { ToastProvider } from './Toast.tsx';

const NavItemLink = styled(NavLink)({});
const CommandPalette = lazy(() => import('./CommandPalette.tsx'));
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const RAIL = 248;
const RAIL_COLLAPSED = 64;

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export function AppShell({ viewer: viewerRef, children }: { viewer: AppShell_viewer$key; children: ReactNode }) {
  const viewer = useFragment(
    graphql`
      fragment AppShell_viewer on Viewer {
        canEdit
        tenant { name nameLocal theme { logo logoOnDark mark } }
        ...SessionBanner_viewer
        ...AccountMenu_viewer
      }
    `,
    viewerRef,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const desktop = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });
  const { navCollapsed, setNavCollapsed, resolvedMode } = usePreferences();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Search anywhere: ⌘K / Ctrl+K, or the button under the account. The palette loads on first use.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const openPalette = () => { setPaletteLoaded(true); setPaletteOpen(true); setMobileOpen(false); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteLoaded(true);
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const location = useLocation();
  const collapsed = desktop && navCollapsed;
  const logo = resolvedMode === 'dark' ? viewer.tenant.theme.logoOnDark : viewer.tenant.theme.logo;
  const tenantName = intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name;

  const items: NavItem[] = [
    { to: '/', label: intl.formatMessage({ id: 'nav.overview' }), icon: <LayoutDashboard size={18} strokeWidth={1.6} aria-hidden />, end: true },
    { to: '/leases', label: intl.formatMessage({ id: 'nav.leases' }), icon: <ScrollText size={18} strokeWidth={1.6} aria-hidden />, end: false },
    { to: '/key-dates', label: intl.formatMessage({ id: 'nav.keyDates' }), icon: <CalendarClock size={18} strokeWidth={1.6} aria-hidden />, end: false },
    ...(viewer.canEdit ? [{ to: '/leases/new', label: intl.formatMessage({ id: 'nav.newLease' }), icon: <FilePlus2 size={18} strokeWidth={1.6} aria-hidden />, end: true }] : []),
  ];

  const isActive = (item: NavItem) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && !(item.to === '/leases' && location.pathname === '/leases/new');

  const nav = (
    <Box component="nav" aria-label={intl.formatMessage({ id: 'nav.main' })} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: collapsed ? 2 : 5, pt: 6, pb: 4, display: 'flex', alignItems: 'center', minHeight: 88 }}>
        {collapsed ? (
          <img src={viewer.tenant.theme.mark} alt={tenantName} width={36} height={36} style={{ display: 'block', margin: '0 auto' }} />
        ) : (
          <img src={logo} alt={tenantName} height={52} style={{ display: 'block', maxWidth: '100%', objectFit: 'contain', objectPosition: theme.direction === 'rtl' ? 'right' : 'left' }} />
        )}
      </Box>
      {/* Who is signed in, and the way to switch company or role, sit at the top where people look. */}
      <Box sx={{ px: collapsed ? 2 : 3, pb: 4, mb: 3, borderBottom: `1px solid ${t.rule}` }}>
        <AccountMenu viewer={viewer} collapsed={collapsed} />
        <Tooltip title={collapsed ? intl.formatMessage({ id: 'palette.open' }) : ''} placement={theme.direction === 'rtl' ? 'left' : 'right'}>
          <ButtonBase
            onClick={openPalette}
            aria-haspopup="dialog"
            aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
            aria-label={collapsed ? intl.formatMessage({ id: 'palette.open' }) : undefined}
            sx={{
              width: '100%', mt: 2, display: 'flex', alignItems: 'center', gap: 2.5, minHeight: 38, px: collapsed ? 0 : 3, borderRadius: 1,
              justifyContent: collapsed ? 'center' : 'flex-start', color: t.inkSecondary, fontSize: '0.8125rem', border: `1px solid ${t.rule}`, backgroundColor: t.paper,
              transition: 'border-color 120ms ease, color 120ms ease', '&:hover': { borderColor: t.ruleStrong, color: t.ink },
              '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
            }}
          >
            <Search size={15} strokeWidth={1.8} aria-hidden />
            {!collapsed && (
              <>
                <Box component="span" sx={{ flex: 1, textAlign: 'start' }}>{intl.formatMessage({ id: 'palette.trigger' })}</Box>
                <Box component="kbd" aria-hidden sx={{ fontFamily: 'inherit', fontSize: '0.6875rem', color: t.inkTertiary, border: `1px solid ${t.rule}`, borderRadius: 0.75, px: 1 }}>
                  {IS_MAC ? '⌘K' : 'Ctrl K'}
                </Box>
              </>
            )}
          </ButtonBase>
        </Tooltip>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, px: collapsed ? 2 : 3, display: 'grid', gap: 0.5 }}>
        {items.map((item) => {
          const active = isActive(item);
          const link = (
            <NavItemLink
              to={item.to}
              end={item.end ?? false}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 3, minHeight: 40, px: collapsed ? 0 : 3,
                justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: 1, textDecoration: 'none',
                color: active ? t.ink : t.inkSecondary, fontWeight: active ? 600 : 500, fontSize: '0.875rem',
                backgroundColor: active ? t.brandSoft : 'transparent', position: 'relative',
                transition: 'background-color 120ms ease, color 120ms ease',
                '&:hover': { backgroundColor: active ? t.brandSoft : t.brandTint, color: t.ink },
                '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
                '&::before': active && !collapsed ? {
                  content: '""', position: 'absolute', insetInlineStart: -12, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: t.brand,
                } : undefined,
              }}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </NavItemLink>
          );
          return (
            <li key={item.to}>
              {collapsed ? <Tooltip title={item.label} placement={theme.direction === 'rtl' ? 'left' : 'right'}>{link}</Tooltip> : link}
            </li>
          );
        })}
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ px: collapsed ? 2 : 3, pb: 3, display: 'grid', gap: 1 }}>
        {desktop && (
          <Tooltip title={intl.formatMessage({ id: collapsed ? 'nav.expand' : 'nav.collapse' })} placement={theme.direction === 'rtl' ? 'left' : 'right'}>
            <IconButton
              size="small"
              onClick={() => setNavCollapsed(!navCollapsed)}
              aria-label={intl.formatMessage({ id: collapsed ? 'nav.expand' : 'nav.collapse' })}
              sx={{ justifySelf: collapsed ? 'center' : 'end', transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }}
            >
              {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.6} /> : <PanelLeftClose size={18} strokeWidth={1.6} />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={collapsed ? intl.formatMessage({ id: 'shell.signOut' }) : ''} placement={theme.direction === 'rtl' ? 'left' : 'right'}>
          <ButtonBase
            onClick={() => void signOut()}
            aria-label={collapsed ? intl.formatMessage({ id: 'shell.signOut' }) : undefined}
            sx={{
              display: 'flex', alignItems: 'center', gap: 3, minHeight: 40, px: collapsed ? 0 : 3, borderRadius: 1,
              justifyContent: collapsed ? 'center' : 'flex-start', color: t.inkSecondary, fontSize: '0.875rem', fontWeight: 500,
              transition: 'background-color 120ms ease, color 120ms ease',
              '&:hover': { backgroundColor: t.brandTint, color: t.ink },
              '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
            }}
          >
            <LogOut size={18} strokeWidth={1.6} aria-hidden style={theme.direction === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />
            {!collapsed && <span>{intl.formatMessage({ id: 'shell.signOut' })}</span>}
          </ButtonBase>
        </Tooltip>
      </Box>
    </Box>
  );

  const railWidth = collapsed ? RAIL_COLLAPSED : RAIL;

  return (
    <ToastProvider>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute', insetInlineStart: 8, top: -48, zIndex: 2000, px: 3, py: 2, borderRadius: 1,
          backgroundColor: t.ink, color: t.paper, textDecoration: 'none', fontWeight: 600,
          '&:focus': { top: 8 },
        }}
      >
        {intl.formatMessage({ id: 'app.skipToContent' })}
      </Box>
      <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
        {desktop ? (
          <Box
            sx={{
              width: railWidth, flexShrink: 0, position: 'sticky', top: 0, height: '100dvh',
              borderInlineEnd: `1px solid ${t.rule}`, backgroundColor: t.surface, transition: 'width 160ms ease',
            }}
          >
            {nav}
          </Box>
        ) : (
          <Drawer
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            anchor={theme.direction === 'rtl' ? 'right' : 'left'}
            slotProps={{ paper: { sx: { width: RAIL } } }}
          >
            {nav}
          </Drawer>
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!desktop && (
            <Box
              component="header"
              sx={{
                position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 2, px: 3, minHeight: 56,
                backgroundColor: t.surface, borderBottom: `1px solid ${t.rule}`,
              }}
            >
              <IconButton onClick={() => setMobileOpen(true)} aria-label={intl.formatMessage({ id: 'nav.openMenu' })} sx={{ width: 44, height: 44 }}>
                <Menu size={20} strokeWidth={1.6} />
              </IconButton>
              <img src={logo} alt={tenantName} height={30} style={{ display: 'block', maxWidth: 200, objectFit: 'contain' }} />
            </Box>
          )}
          <SessionBanner viewer={viewer} />
          {paletteLoaded && (
            <Suspense fallback={null}>
              <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} canEdit={viewer.canEdit} />
            </Suspense>
          )}
          <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, minWidth: 0, outline: 'none' }}>
            {children}
          </Box>
        </Box>
      </Box>
    </ToastProvider>
  );
}
