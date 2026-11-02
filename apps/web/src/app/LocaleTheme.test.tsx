import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { caches } from './LocaleTheme.tsx';
import { createAppTheme } from '../theme/theme.ts';

describe('right-to-left styling', () => {
  // Regression: the RTL cache once mixed stylis versions, and any input with a placeholder threw
  // "Cannot read properties of undefined (reading 'push')", taking down every Arabic form.
  it('renders inputs with placeholders through the RTL cache', () => {
    const theme = createAppTheme({ brandHue: 200, accentHue: 82, density: 'comfortable' }, 'light', 'rtl');
    render(
      <CacheProvider value={caches.rtl}>
        <ThemeProvider theme={theme}>
          <div dir="rtl">
            <TextField label="اسم المؤجر" placeholder="ابدأ بالكتابة" />
          </div>
        </ThemeProvider>
      </CacheProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'اسم المؤجر' })).toBeInTheDocument();
  });
});
