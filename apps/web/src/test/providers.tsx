import type { ReactNode } from 'react';
import { RelayEnvironmentProvider } from 'react-relay';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { Environment } from 'relay-runtime';
import catalogue from '../i18n/catalogues/en.ts';
import { createAppTheme } from '../theme/theme.ts';
import { ToastProvider } from '../shell/Toast.tsx';

const theme = createAppTheme({ brandHue: 138, accentHue: 70, density: 'standard' }, 'light', 'ltr');

// Everything a page needs around it in tests: Relay, translations, theme, dates and routing.
export function Providers({ environment, children, initialPath = '/' }: { environment: Environment; children: ReactNode; initialPath?: string }) {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <IntlProvider locale="en-GB" messages={catalogue}>
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <MemoryRouter initialEntries={[initialPath]}>
              <ToastProvider>{children}</ToastProvider>
            </MemoryRouter>
          </LocalizationProvider>
        </ThemeProvider>
      </IntlProvider>
    </RelayEnvironmentProvider>
  );
}
