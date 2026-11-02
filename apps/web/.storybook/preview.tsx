import type { Preview } from '@storybook/react-vite';
import { useEffect, useMemo } from 'react';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import en from '../src/i18n/catalogues/en.ts';
import ar from '../src/i18n/catalogues/ar.ts';
import sw from '../src/i18n/catalogues/sw.ts';
import { caches } from '../src/app/LocaleTheme.tsx';
import { createAppTheme } from '../src/theme/theme.ts';
import { PreferencesProvider } from '../src/app/preferences.tsx';
import { ToastProvider } from '../src/shell/Toast.tsx';

const CATALOGUES = { en, ar, sw } as const;
const LOCALES = { en: 'en-GB', ar: 'ar-AE', sw: 'sw-KE' } as const;
// The three companies' brand hues, so each component can be seen in every theme.
const BRANDS = { mbuyu: { brandHue: 138, accentHue: 70 }, sunbula: { brandHue: 200, accentHue: 82 }, halvard: { brandHue: 258, accentHue: 78 } } as const;

const preview: Preview = {
  globalTypes: {
    language: { description: 'Language', toolbar: { title: 'Language', icon: 'globe', items: [{ value: 'en', title: 'English' }, { value: 'ar', title: 'العربية' }, { value: 'sw', title: 'Kiswahili' }], dynamicTitle: true } },
    mode: { description: 'Mode', toolbar: { title: 'Mode', icon: 'mirror', items: [{ value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }], dynamicTitle: true } },
    brand: { description: 'Company theme', toolbar: { title: 'Theme', icon: 'paintbrush', items: [{ value: 'mbuyu', title: 'Mbuyu (green)' }, { value: 'sunbula', title: 'Sunbula (teal)' }, { value: 'halvard', title: 'Halvard (blue)' }], dynamicTitle: true } },
  },
  initialGlobals: { language: 'en', mode: 'light', brand: 'mbuyu' },
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    controls: { expanded: true },
    options: { storySort: { order: ['Foundations', 'Components', 'Data'] } },
  },
  decorators: [
    (Story, ctx) => {
      const language = ctx.globals.language as keyof typeof CATALOGUES;
      const mode = ctx.globals.mode as 'light' | 'dark';
      const brand = BRANDS[ctx.globals.brand as keyof typeof BRANDS];
      const dir = language === 'ar' ? 'rtl' : 'ltr';
      const theme = useMemo(() => createAppTheme({ ...brand, density: 'standard' }, mode, dir), [brand, mode, dir]);
      useEffect(() => {
        document.documentElement.dir = dir;
        document.documentElement.lang = LOCALES[language];
        document.body.style.backgroundColor = theme.tokens.paper;
      }, [dir, language, theme]);
      return (
        <PreferencesProvider>
          <MemoryRouter>
            <CacheProvider value={caches[dir]}>
              <ThemeProvider theme={theme}>
                <CssBaseline />
                <IntlProvider locale={LOCALES[language]} messages={CATALOGUES[language]} defaultLocale="en-GB">
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <ToastProvider><Story /></ToastProvider>
                  </LocalizationProvider>
                </IntlProvider>
              </ThemeProvider>
            </CacheProvider>
          </MemoryRouter>
        </PreferencesProvider>
      );
    },
  ],
};
export default preview;
