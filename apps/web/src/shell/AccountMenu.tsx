import { lazy, Suspense, useState, type MouseEvent } from 'react';
import { graphql, useFragment } from 'react-relay';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { ChevronsUpDown } from 'lucide-react';
import type { AccountMenu_viewer$key } from './__generated__/AccountMenu_viewer.graphql';
import type { Language } from '../i18n/locale.ts';
import { Initials } from '../components/Initials.tsx';

const AccountMenuPopup = lazy(async () => ({ default: (await import('./AccountMenuPopup.tsx')).AccountMenuPopup }));

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
  const [anchor, setAnchorState] = useState<HTMLElement | null>(null);
  const [used, setUsed] = useState(false);
  const setAnchor = (el: HTMLElement | null) => { if (el) setUsed(true); setAnchorState(el); };
  const open = Boolean(anchor);
  const languages = Array.from(new Set(['en', ...viewer.tenant.languages])) as Language[];
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

  return (
    <>
      {collapsed ? <Tooltip title={`${viewer.user.displayName} · ${roleLabel}`} placement={theme.direction === 'rtl' ? 'left' : 'right'}>{trigger}</Tooltip> : trigger}
      {/* The menu's code (and the accounts list) load the first time it is opened. */}
      {used && (
        <Suspense fallback={null}>
          <AccountMenuPopup
            anchor={anchor}
            onClose={() => setAnchor(null)}
            collapsed={collapsed}
            user={{ id: viewer.user.id, displayName: viewer.user.displayName, jobTitle: viewer.user.jobTitle ?? null }}
            companyName={intl.locale.startsWith('ar') && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name}
            languages={languages}
          />
        </Suspense>
      )}
    </>
  );
}
