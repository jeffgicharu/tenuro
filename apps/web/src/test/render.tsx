import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { RelayEnvironmentProvider } from 'react-relay';
import type { Environment } from 'relay-runtime';
import { createMockEnvironment } from 'relay-test-utils';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/en-gb';
import enCatalogue from '../i18n/catalogues/en.ts';
import { createAppTheme } from '../theme/theme.ts';
import { PreferencesProvider } from '../app/preferences.tsx';
import { ToastProvider } from '../shell/Toast.tsx';

export interface Rendered {
  environment: ReturnType<typeof createMockEnvironment>;
}

const theme = createAppTheme({ brandHue: 138, accentHue: 70, density: 'standard' }, 'light', 'ltr');

// Wraps a component in every provider the app gives it, with a Relay mock environment.
export function renderWithProviders(ui: ReactElement, opts: { environment?: ReturnType<typeof createMockEnvironment>; route?: string } = {}) {
  const environment = opts.environment ?? createMockEnvironment();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PreferencesProvider>
      <RelayEnvironmentProvider environment={environment as unknown as Environment}>
        <MemoryRouter initialEntries={[opts.route ?? '/leases/new']}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <IntlProvider locale="en-GB" messages={enCatalogue} defaultLocale="en-GB">
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
                <ToastProvider>{children}</ToastProvider>
              </LocalizationProvider>
            </IntlProvider>
          </ThemeProvider>
        </MemoryRouter>
      </RelayEnvironmentProvider>
    </PreferencesProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), environment };
}
