import { Fragment, Suspense, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import { Check, LogOut, Monitor, Moon, Sun, Users } from 'lucide-react';
import type { AccountMenuAccountsQuery } from './__generated__/AccountMenuAccountsQuery.graphql';
import { usePreferences, type ModePreference } from '../app/preferences.tsx';
import { signInAs, signOut } from '../app/session.ts';
import { LANGUAGES, type Language } from '../i18n/locale.ts';

// Language and appearance choices share a row. Each stays a direct child of the menu list, which is
// how MUI's arrow-key navigation finds its items.
const rowItem = (count: number) => ({
  display: 'inline-flex', width: `${100 / count}%`, justifyContent: 'center', gap: 1.5, px: 1, borderRadius: 1,
  fontWeight: 500, '&.Mui-selected': { fontWeight: 600 },
}) as const;

interface Props {
  anchor: HTMLElement | null;
  onClose(): void;
  collapsed: boolean;
  user: { id: string; displayName: string; jobTitle: string | null };
  companyName: string;
  languages: Language[];
}

// The account menu itself: switch company or role, language, appearance, sign out.
export function AccountMenuPopup({ anchor, onClose, collapsed, user, companyName, languages }: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const prefs = usePreferences();
  const open = Boolean(anchor);
  const currentLanguage = intl.locale.slice(0, 2) as Language;
  const modes: { value: ModePreference; icon: typeof Sun }[] = [
    { value: 'light', icon: Sun }, { value: 'dark', icon: Moon }, { value: 'system', icon: Monitor },
  ];

  return (
    <Menu
      anchorEl={anchor}
      open={open}
      onClose={onClose}
      // The trigger sits at the top of the rail: the menu opens below it, aligned to its start edge.
      // Popover edges are physical, so the start edge flips in right-to-left.
      anchorOrigin={{ vertical: 'bottom', horizontal: (theme.direction === 'rtl') !== collapsed ? 'right' : 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: theme.direction === 'rtl' ? 'right' : 'left' }}
      slotProps={{ paper: { sx: { width: 300, maxHeight: 'calc(100dvh - 96px)' } }, list: { dense: true, sx: { py: 1 } } }}
    >
      <Box sx={{ px: 4, py: 3 }}>
        <Box sx={{ fontWeight: 600 }}>{user.displayName}</Box>
        <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>{user.jobTitle}</Box>
        <Box sx={{ fontSize: '0.8125rem', color: t.inkSecondary }}>{companyName}</Box>
      </Box>
      <Divider />
      <ListSubheader disableSticky sx={{ lineHeight: '32px', backgroundColor: 'transparent' }}>
        <FormattedMessage id="shell.switchCompany" />
      </ListSubheader>
      {open && (
        <Suspense fallback={<Box sx={{ px: 4, py: 1 }}><Skeleton height={28} /><Skeleton height={28} /><Skeleton height={28} /></Box>}>
          <AccountItems currentUserId={user.id} />
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
        <MenuItem key={l} role="menuitemradio" aria-checked={currentLanguage === l} selected={currentLanguage === l} lang={l} onClick={() => { prefs.setLanguage(l); onClose(); }} sx={rowItem(languages.length)}>
          {currentLanguage === l && <Check size={14} aria-hidden />}
          {LANGUAGES[l].label}
        </MenuItem>
      ))}
      <Divider />
      <ListSubheader disableSticky sx={{ lineHeight: '32px', backgroundColor: 'transparent' }}>
        <FormattedMessage id="shell.appearance" />
      </ListSubheader>
      {modes.map(({ value, icon: Icon }) => (
        <MenuItem key={value} role="menuitemradio" aria-checked={prefs.mode === value} selected={prefs.mode === value} onClick={() => prefs.setMode(value)} sx={rowItem(modes.length)}>
          <Icon size={14} strokeWidth={1.7} aria-hidden />
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
          // A fragment, not a wrapper: arrow keys only move between the menu list's direct children.
          <Fragment key={a.id}>
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
          </Fragment>
        );
      })}
    </>
  );
}
