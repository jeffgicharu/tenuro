import { Suspense, useState, type MouseEvent } from 'react';
import { graphql, useFragment, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun, Users } from 'lucide-react';
import type { AccountMenu_viewer$key } from './__generated__/AccountMenu_viewer.graphql';
import type { AccountMenuAccountsQuery } from './__generated__/AccountMenuAccountsQuery.graphql';
import { usePreferences, type ModePreference } from '../app/preferences.tsx';
import { signInAs, signOut } from '../app/session.ts';
import { LANGUAGES, type Language } from '../i18n/locale.ts';
import { Initials } from '../components/Initials.tsx';

export function AccountMenu({ viewer: ref, collapsed }: { viewer: AccountMenu_viewer$key; collapsed: boolean }) {
  const viewer = useFragment(
    graphql`
      fragment AccountMenu_viewer on Viewer {
        user { id displayName initials jobTitle role }
        tenant { id name nameLocal languages }
      }
    `,
    ref,
  );
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const prefs = usePreferences();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const languages = Array.from(new Set(['en', ...viewer.tenant.languages])) as Language[];
  const currentLanguage = intl.locale.slice(0, 2) as Language;
  const roleLabel = intl.formatMessage({ id: `shell.role.${viewer.user.role}` });

  const trigger = (
    <ButtonBase
      onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
      aria-haspopup="menu"
      aria-expanded={open}
      // Expanded, the visible name and role are the button's name (WCAG 2.5.3: a separate "Account"
      // label hid the words a speech user would say). Collapsed, only the initials show, and they
      // are hidden from assistive technology, so the label spells the person out.
      aria-label={collapsed ? `${viewer.user.displayName}, ${roleLabel}` : undefined}
      sx={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 3, p: 2, borderRadius: 1, textAlign: 'start',
        justifyContent: collapsed ? 'center' : 'flex-start', border: `1px solid ${open ? t.ruleStrong : t.rule}`, backgroundColor: t.paper,
        '&:hover': { backgroundColor: t.brandTint },
        '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 },
      }}
    >
      <Initials text={viewer.user.initials} />
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontWeight: 600, fontSize: '0.8125rem', color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {viewer.user.displayName}
          </Box>
          <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleLabel}</Box>
        </Box>
      )}
      {!collapsed && <ChevronsUpDown size={15} strokeWidth={1.7} aria-hidden style={{ marginInlineStart: 'auto', flexShrink: 0, color: t.inkTertiary }} />}
    </ButtonBase>
  );

  const modes: { value: ModePreference; icon: typeof Sun }[] = [
    { value: 'light', icon: Sun }, { value: 'dark', icon: Moon }, { value: 'system', icon: Monitor },
  ];

  return (
    <>
      {collapsed ? <Tooltip title={`${viewer.user.displayName} · ${roleLabel}`} placement={theme.direction === 'rtl' ? 'left' : 'right'}>{trigger}</Tooltip> : trigger}
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        // The trigger sits at the top of the rail: the menu opens below it, aligned to its start edge.
        // Popover edges are physical, so the start edge flips in right-to-left.
        anchorOrigin={{ vertical: 'bottom', horizontal: (theme.direction === 'rtl') !== collapsed ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: theme.direction === 'rtl' ? 'right' : 'left' }}
        slotProps={{ paper: { sx: { width: 300, maxHeight: '80dvh' } }, list: { dense: true, sx: { py: 1 } } }}
      >
        <Box sx={{ px: 4, py: 3 }}>
          <Box sx={{ fontWeight: 600 }}>{viewer.user.displayName}</Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>{viewer.user.jobTitle}</Box>
          <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>
            {intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name}
          </Box>
        </Box>
        <Divider />
        <ListSubheader disableSticky sx={{ lineHeight: '32px', backgroundColor: 'transparent' }}>
          <FormattedMessage id="shell.switchCompany" />
        </ListSubheader>
        {open && (
          <Suspense fallback={<Box sx={{ px: 4, py: 1 }}><Skeleton height={28} /><Skeleton height={28} /><Skeleton height={28} /></Box>}>
            <AccountItems currentUserId={viewer.user.id} />
          </Suspense>
        )}
        <MenuItem component="a" href="/sign-in">
          <Box sx={{ width: 22, display: 'inline-flex' }} />
          <Users size={15} strokeWidth={1.7} style={{ marginInlineEnd: 8 }} aria-hidden />
          <FormattedMessage id="shell.allAccounts" />
        </MenuItem>
        <Divider />
        <ListSubheader disableSticky sx={{ lineHeight: '32px', backgroundColor: 'transparent' }}>
          <FormattedMessage id="shell.language" />
        </ListSubheader>
        {languages.map((l) => (
          <MenuItem key={l} role="menuitemradio" aria-checked={currentLanguage === l} lang={l} onClick={() => { prefs.setLanguage(l); setAnchor(null); }}>
            <Box sx={{ width: 22, display: 'inline-flex' }}>{currentLanguage === l && <Check size={15} />}</Box>
            {LANGUAGES[l].label}
          </MenuItem>
        ))}
        <Divider />
        <ListSubheader disableSticky sx={{ lineHeight: '32px', backgroundColor: 'transparent' }}>
          <FormattedMessage id="shell.appearance" />
        </ListSubheader>
        {modes.map(({ value, icon: Icon }) => (
          <MenuItem key={value} role="menuitemradio" aria-checked={prefs.mode === value} onClick={() => prefs.setMode(value)}>
            <Box sx={{ width: 22, display: 'inline-flex' }}>{prefs.mode === value && <Check size={15} />}</Box>
            <Icon size={15} strokeWidth={1.7} style={{ marginInlineEnd: 8 }} aria-hidden />
            <FormattedMessage id={`shell.mode.${value}`} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => void signOut()}>
          <Box sx={{ width: 22, display: 'inline-flex' }} />
          <LogOut size={15} strokeWidth={1.7} style={{ marginInlineEnd: 8 }} aria-hidden />
          <FormattedMessage id="shell.signOut" />
        </MenuItem>
      </Menu>
    </>
  );
}

function AccountItems({ currentUserId }: { currentUserId: string }) {
  const intl = useIntl();
  const t = useTheme().tokens;
  const data = useLazyLoadQuery<AccountMenuAccountsQuery>(
    graphql`
      query AccountMenuAccountsQuery {
        signInAccounts { id displayName role tenant { id name nameLocal } }
      }
    `,
    {},
    { fetchPolicy: 'store-or-network' },
  );
  const [pending, setPending] = useState<string | null>(null);
  let lastTenant = '';
  return (
    <>
      {data.signInAccounts.map((a) => {
        const header = a.tenant.id !== lastTenant;
        lastTenant = a.tenant.id;
        const current = a.id === currentUserId;
        return (
          <Box key={a.id}>
            {header && (
              <Box sx={{ px: 4, pt: 2, pb: 0.5, fontSize: '0.6875rem', fontWeight: 600, color: t.inkTertiary }}>
                {intl.locale.startsWith('ar') && a.tenant.nameLocal ? a.tenant.nameLocal : a.tenant.name}
              </Box>
            )}
            <MenuItem
              role="menuitemradio"
              aria-checked={current}
              disabled={pending !== null}
              onClick={() => {
                if (current) return;
                setPending(a.id);
                signInAs(a.id, window.location.pathname.startsWith('/leases/') ? '/leases' : window.location.pathname).catch(() => setPending(null));
              }}
            >
              <Box sx={{ width: 22, display: 'inline-flex' }}>{current && <Check size={15} />}</Box>
              <Box sx={{ flex: 1 }}>{intl.formatMessage({ id: `shell.role.${a.role}` })}</Box>
              <Box sx={{ fontSize: '0.75rem', color: t.inkTertiary }}>{a.displayName}</Box>
            </MenuItem>
          </Box>
        );
      })}
    </>
  );
}
