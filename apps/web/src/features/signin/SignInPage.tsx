import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowRight, Check, Eye, LogOut, PenLine, ShieldCheck } from 'lucide-react';
import type { SignInPageQuery } from './__generated__/SignInPageQuery.graphql';
import { signInQuery } from './loader.ts';
import { useRouteQuery } from '../../app/relayRoute.ts';
import { usePreferences } from '../../app/preferences.tsx';
import { SignInError, signInAs, signOut } from '../../app/session.ts';
import { LANGUAGES, type Language } from '../../i18n/locale.ts';

type Account = SignInPageQuery['response']['signInAccounts'][number];

const ROLE_ICON = { ADMIN: ShieldCheck, MANAGER: PenLine, VIEWER: Eye } as const;

export function SignInPage() {
  const { signInAccounts, viewer } = useRouteQuery<SignInPageQuery>(signInQuery);
  const intl = useIntl();
  const theme = useTheme();
  const t = theme.tokens;
  const prefs = usePreferences();
  const rtl = theme.direction === 'rtl';
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<'limit' | 'failed' | null>(null);
  const currentLanguage = intl.locale.slice(0, 2) as Language;
  const countryName = useMemo(() => new Intl.DisplayNames([intl.locale], { type: 'region' }), [intl.locale]);
  const companies = useMemo(() => {
    const map = new Map<string, { tenant: Account['tenant']; accounts: Account[] }>();
    for (const a of signInAccounts) {
      const entry = map.get(a.tenant.id) ?? { tenant: a.tenant, accounts: [] };
      entry.accounts.push(a);
      map.set(a.tenant.id, entry);
    }
    return [...map.values()];
  }, [signInAccounts]);

  const go = async (a: Account) => {
    setPending(a.id);
    setError(null);
    try {
      await signInAs(a.id);
    } catch (e) {
      setPending(null);
      setError(e instanceof SignInError ? e.kind : 'failed');
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: t.paper }}>
      <Box
        component="picture"
        aria-hidden
        sx={{ position: 'absolute', inset: 0, display: { xs: 'none', md: 'block' }, transform: rtl ? 'scaleX(-1)' : undefined }}
      >
        <source type="image/avif" srcSet="/static/photos/backdrop/signin-1440.avif 1440w, /static/photos/backdrop/signin-2880.avif 2880w" sizes="100vw" />
        <Box
          component="img"
          src="/static/photos/backdrop/signin-1440.jpg"
          srcSet="/static/photos/backdrop/signin-1440.jpg 1440w, /static/photos/backdrop/signin-2880.jpg 2880w"
          sizes="100vw"
          alt=""
          fetchPriority="high"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 50%', filter: t.mode === 'dark' ? 'brightness(0.42) saturate(0.8)' : undefined }}
        />
      </Box>
      <Box sx={{ position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', px: { xs: 4, md: 10, xl: 16 }, py: { xs: 6, md: 10 } }}>
        <Box
          component="main"
          sx={{
            width: '100%', maxWidth: 620, backgroundColor: t.mode === 'dark' ? 'rgba(30,28,22,0.94)' : 'rgba(251,249,244,0.95)',
            border: `1px solid ${t.rule}`, borderRadius: 1.5, p: { xs: 6, md: 10 },
            boxShadow: t.mode === 'dark' ? '0 30px 80px -30px rgba(0,0,0,0.7)' : '0 30px 80px -40px rgba(60,45,20,0.35)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, mb: 8 }}>
            <img
              src={t.mode === 'dark' ? '/static/brand/tenuro-lockup-on-dark.svg' : '/static/brand/tenuro-lockup.svg'}
              alt="Tenuro"
              height={36}
              style={{ display: 'block' }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={currentLanguage}
              onChange={(_e, v: Language | null) => v && prefs.setLanguage(v)}
              aria-label={intl.formatMessage({ id: 'shell.language' })}
            >
              {(Object.keys(LANGUAGES) as Language[]).map((l) => (
                <ToggleButton key={l} value={l} lang={l} sx={{ px: 2.5, py: 0.5, fontSize: '0.75rem', textTransform: 'none' }}>
                  {LANGUAGES[l].label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 3 }}>
            <FormattedMessage id="signin.title" />
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 8, maxWidth: 520 }}>
            <FormattedMessage id="signin.lede" />
          </Typography>

          {viewer && (
            <Box
              role="status"
              sx={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, mb: 6, px: 4, py: 3,
                border: `1px solid ${t.rule}`, borderRadius: 1, backgroundColor: t.brandTint,
              }}
            >
              <Box sx={{ flex: '1 1 240px', fontSize: '0.875rem' }}>
                <FormattedMessage
                  id="signin.current"
                  values={{
                    name: <strong>{viewer.user.displayName}</strong>,
                    role: intl.formatMessage({ id: `shell.role.${viewer.user.role}` }),
                    company: currentLanguage === 'ar' && viewer.tenant.nameLocal ? viewer.tenant.nameLocal : viewer.tenant.name,
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button size="small" variant="text" startIcon={<LogOut size={14} aria-hidden />} onClick={() => void signOut()}>
                  <FormattedMessage id="shell.signOut" />
                </Button>
                <Button size="small" variant="contained" href="/leases" endIcon={<ArrowRight size={14} aria-hidden style={rtl ? { transform: 'scaleX(-1)' } : undefined} />}>
                  <FormattedMessage id="signin.continue" />
                </Button>
              </Box>
            </Box>
          )}

          {error && (
            <Alert severity={error === 'limit' ? 'warning' : 'error'} sx={{ mb: 5 }} role="alert">
              <FormattedMessage id={error === 'limit' ? 'signin.limit' : 'signin.error'} />
            </Alert>
          )}

          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: `1px solid ${t.ruleStrong}` }}>
            {companies.map(({ tenant, accounts }) => {
              const name = currentLanguage === 'ar' && tenant.nameLocal ? tenant.nameLocal : tenant.name;
              return (
                <Box component="li" key={tenant.id} sx={{ py: 5, borderBottom: `1px solid ${t.rule}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mb: 4 }}>
                    <img src={tenant.theme.mark} alt="" width={40} height={40} style={{ flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography id={`company-${tenant.id}`} variant="h3" component="h2" sx={{ fontSize: '1.15rem' }} lang={currentLanguage === 'ar' && tenant.nameLocal ? 'ar' : undefined}>
                        {name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" data-num>
                        <FormattedMessage id="signin.leases" values={{ count: tenant.leaseCount }} />
                        {' · '}
                        {intl.formatList(tenant.countries.map((c) => countryName.of(c) ?? c), { type: 'unit', style: 'short' })}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                    {accounts.map((a) => {
                      const Icon = ROLE_ICON[a.role];
                      const current = viewer?.user.id === a.id;
                      return (
                        <Button
                          key={a.id}
                          variant="outlined"
                          aria-current={current ? 'true' : undefined}
                          onClick={() => (current ? window.location.assign('/leases') : void go(a))}
                          loading={pending === a.id}
                          disabled={pending !== null && pending !== a.id}
                          // The accessible name is the visible text (role and person), as WCAG 2.5.3 asks;
                          // the company heading is announced as the description.
                          aria-describedby={`company-${tenant.id}`}
                          sx={{
                            justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'start', flexDirection: 'column', gap: 0.5,
                            py: 2.5, px: 3, minHeight: 64, backgroundColor: current ? t.brandSoft : t.surface,
                            borderColor: current ? t.brand : undefined,
                            '&:hover .arrow': { opacity: 1, transform: 'translateX(0)' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', fontWeight: 600 }}>
                            <Icon size={15} strokeWidth={1.8} aria-hidden />
                            <span><FormattedMessage id={`signin.roleShort.${a.role}`} /></span>
                            {current && <Check size={14} strokeWidth={2.2} aria-hidden />}
                            <Box
                              className="arrow"
                              component="span"
                              sx={{ marginInlineStart: 'auto', display: 'inline-flex', opacity: 0, transform: rtl ? 'translateX(4px)' : 'translateX(-4px)', transition: 'opacity 150ms ease, transform 150ms ease' }}
                            >
                              <ArrowRight size={15} aria-hidden style={rtl ? { transform: 'scaleX(-1)' } : undefined} />
                            </Box>
                          </Box>
                          <Box component="span" sx={{ fontSize: '0.75rem', color: t.inkSecondary, fontWeight: 400 }}>{a.displayName}</Box>
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>

          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1.5, mt: 6, mb: 0, fontSize: '0.8125rem', color: t.inkSecondary }}>
            {(['ADMIN', 'MANAGER', 'VIEWER'] as const).map((role) => {
              const Icon = ROLE_ICON[role];
              return (
                <Box key={role} sx={{ display: 'contents' }}>
                  <Box component="dt" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 600, color: t.ink }}>
                    <Icon size={14} strokeWidth={1.8} aria-hidden />
                    <FormattedMessage id={`shell.role.${role}`} />
                  </Box>
                  <Box component="dd" sx={{ m: 0 }}><FormattedMessage id={`signin.role.${role}`} /></Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
