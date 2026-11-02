import { use, useEffect, useMemo, type ReactNode } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { IntlProvider } from 'react-intl';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import 'dayjs/locale/ar';
import 'dayjs/locale/sw';
import 'dayjs/locale/en-gb';
import { loadCatalogue, type Messages } from '../i18n/catalogue.ts';
import { intlLocale, LANGUAGES, type Language } from '../i18n/locale.ts';
import { createAppTheme } from '../theme/theme.ts';
import type { Density } from '../theme/tokens.ts';
import { usePreferences } from './preferences.tsx';

export interface TenantLook {
  brandHue: number;
  accentHue: number;
  density: Density;
  locale: string;
  languages: readonly string[];
}

// Tenuro's own screens (sign-in): graphite and paper with a vermilion accent.
export const TENURO_LOOK: TenantLook = { brandHue: 32, accentHue: 32, density: 'standard', locale: 'en-GB', languages: ['en', 'ar', 'sw'] };

const nonce = typeof document !== 'undefined'
  ? document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content
  : undefined;

const caches = {
  ltr: createCache({ key: 'mui', prepend: true, ...(nonce ? { nonce } : {}) }),
  rtl: createCache({ key: 'mui-rtl', prepend: true, stylisPlugins: [prefixer, rtlPlugin], ...(nonce ? { nonce } : {}) }),
};

const catalogues = new Map<Language, Promise<Messages>>();
const catalogueFor = (l: Language) => {
  let p = catalogues.get(l);
  if (!p) {
    p = loadCatalogue(l);
    catalogues.set(l, p);
  }
  return p;
};

export function resolveLanguage(preferred: Language | null, look: TenantLook, userLocale: string | null): Language {
  const allowed = new Set<string>([...look.languages, 'en']);
  if (preferred && allowed.has(preferred)) return preferred;
  if (userLocale && allowed.has(userLocale)) return userLocale as Language;
  const first = look.languages[0];
  return first === 'ar' || first === 'sw' ? first : 'en';
}

export function LocaleTheme({ look, userLocale, children }: { look: TenantLook; userLocale: string | null; children: ReactNode }) {
  const prefs = usePreferences();
  const language = resolveLanguage(prefs.language, look, userLocale);
  const direction = LANGUAGES[language].dir;
  const locale = intlLocale(language, look.locale);
  const messages = use(catalogueFor(language));
  const theme = useMemo(
    () => createAppTheme({ brandHue: look.brandHue, accentHue: look.accentHue, density: look.density }, prefs.resolvedMode, direction),
    [look.brandHue, look.accentHue, look.density, prefs.resolvedMode, direction],
  );

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = direction;
    html.dataset.mode = prefs.resolvedMode;
    document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  }, [locale, direction, prefs.resolvedMode]);

  const dayjsLocale = language === 'ar' ? 'ar' : language === 'sw' ? 'sw' : 'en-gb';

  return (
    <CacheProvider value={caches[direction]}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <IntlProvider locale={locale} messages={messages} defaultLocale="en-GB" onError={reportIntlError}>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={dayjsLocale}>
            {children}
          </LocalizationProvider>
        </IntlProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}

function reportIntlError(err: { code?: string; message: string }) {
  // Missing translations fall back to English; the typed catalogues catch them at build time.
  if (err.code === 'MISSING_TRANSLATION') return;
  if (import.meta.env.DEV) console.warn(err.message);
}
