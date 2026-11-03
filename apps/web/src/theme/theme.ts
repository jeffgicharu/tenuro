import { createTheme, type Theme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import { createTokens, type BrandInput, type Mode, type Tokens } from './tokens.ts';

declare module '@mui/material/styles' {
  interface Theme {
    tokens: Tokens;
  }
  interface ThemeOptions {
    tokens?: Tokens;
  }
}

export const FONT_UI_LATIN = '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_UI_ARABIC = '"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif';
export const FONT_DISPLAY = '"Newsreader Variable", "Newsreader", Georgia, "Times New Roman", serif';
export const FONT_DISPLAY_ARABIC = '"IBM Plex Sans Arabic", "Newsreader Variable", serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

export function createAppTheme(brand: BrandInput, mode: Mode, direction: 'ltr' | 'rtl'): Theme {
  const t = createTokens(brand, mode);
  const arabic = direction === 'rtl';
  const ui = arabic ? FONT_UI_ARABIC : FONT_UI_LATIN;
  const display = arabic ? FONT_DISPLAY_ARABIC : FONT_DISPLAY;
  const radius = 4;

  return createTheme({
    direction,
    tokens: t,
    shape: { borderRadius: radius },
    spacing: 4,
    palette: {
      mode,
      primary: { main: t.brand, dark: t.brandHover, contrastText: t.brandContrast },
      secondary: { main: t.accent },
      error: { main: t.danger },
      warning: { main: t.warning },
      success: { main: t.success },
      background: { default: t.paper, paper: t.surface },
      text: { primary: t.ink, secondary: t.inkSecondary, disabled: t.inkTertiary },
      divider: t.rule,
      action: { hover: t.brandTint, selected: t.selection, focus: t.selection },
    },
    typography: {
      fontFamily: ui,
      fontSize: 14,
      htmlFontSize: 16,
      h1: { fontFamily: display, fontWeight: arabic ? 600 : 500, fontSize: '2rem', lineHeight: 1.15, letterSpacing: arabic ? 0 : '-0.01em' },
      h2: { fontFamily: display, fontWeight: arabic ? 600 : 500, fontSize: '1.5rem', lineHeight: 1.2, letterSpacing: arabic ? 0 : '-0.005em' },
      h3: { fontFamily: display, fontWeight: arabic ? 600 : 500, fontSize: '1.2rem', lineHeight: 1.3 },
      h4: { fontFamily: ui, fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 },
      h5: { fontFamily: ui, fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.4 },
      h6: { fontFamily: ui, fontWeight: 600, fontSize: '0.75rem', lineHeight: 1.4, letterSpacing: arabic ? 0 : '0.06em', textTransform: arabic ? 'none' : 'uppercase' },
      subtitle1: { fontSize: '0.9375rem', lineHeight: 1.45 },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.4 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
      caption: { fontSize: '0.75rem', lineHeight: 1.4, color: t.inkSecondary },
      overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: arabic ? 0 : '0.08em', lineHeight: 1.4 },
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0 },
    },
    components: {
      // MUI's unselected toggle text is a translucent grey that falls just under 4.5:1 on paper.
      MuiToggleButton: {
        styleOverrides: { root: { color: t.inkSecondary, '&.Mui-selected': { color: t.ink } } },
      },
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode },
          body: {
            backgroundColor: t.paper,
            fontFeatureSettings: '"kern", "liga"',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '::selection': { backgroundColor: t.selection },
          '.tabular, [data-num]': { fontVariantNumeric: 'tabular-nums lining-nums' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: t.rule } },
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radius, minHeight: 36, paddingInline: 14, transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
            '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 },
          },
          sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: '0.8125rem' },
          outlined: { borderColor: t.ruleStrong, color: t.ink, '&:hover': { borderColor: t.ink, backgroundColor: t.brandTint } },
          text: { color: t.ink, '&:hover': { backgroundColor: t.brandTint } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: radius, color: t.inkSecondary, '&:hover': { backgroundColor: t.brandTint, color: t.ink }, '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 1 } },
        },
      },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
      MuiInputLabel: {
        styleOverrides: { root: { color: t.inkSecondary, '&.Mui-focused': { color: t.brand } } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.surface,
            borderRadius: radius,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.ruleStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.inkTertiary },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.brand, borderWidth: 1.5 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: t.danger },
          },
          input: { '&::placeholder': { color: t.inkTertiary, opacity: 1 } },
        },
      },
      MuiFormHelperText: { styleOverrides: { root: { marginInline: 0, marginTop: 4 } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radius, fontWeight: 500, height: 24 },
          outlined: { borderColor: t.ruleStrong },
          sizeSmall: { height: 22, fontSize: '0.75rem' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40, borderBottom: `1px solid ${t.rule}` },
          indicator: { height: 2, backgroundColor: t.ink },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40, paddingInline: 4, marginInlineEnd: 20, minWidth: 0, fontWeight: 500, color: t.inkSecondary,
            '&.Mui-selected': { color: t.ink },
            '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
          },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 400 },
        styleOverrides: { tooltip: { backgroundColor: t.ink, color: t.paper, fontSize: '0.75rem', fontWeight: 500, borderRadius: 3, padding: '5px 8px' } },
      },
      MuiDialog: {
        styleOverrides: { paper: { border: `1px solid ${t.rule}`, boxShadow: mode === 'light' ? '0 24px 48px -16px rgba(40,30,10,0.22)' : '0 24px 48px -12px rgba(0,0,0,0.6)' } },
      },
      MuiMenu: {
        styleOverrides: { paper: { border: `1px solid ${t.rule}`, boxShadow: mode === 'light' ? '0 12px 28px -12px rgba(40,30,10,0.25)' : '0 12px 28px -8px rgba(0,0,0,0.6)' } },
      },
      MuiPopover: { styleOverrides: { paper: { border: `1px solid ${t.rule}` } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundColor: t.surface, borderColor: t.rule } } },
      MuiDivider: { styleOverrides: { root: { borderColor: t.rule } } },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: radius, border: `1px solid ${t.rule}`, alignItems: 'flex-start' } },
      },
      MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { color: t.brand, fontWeight: 500 } } },
      // MUI sets dialog titles in h6, which here is a small uppercase label; a dialog's title is a heading.
      MuiDialogTitle: { styleOverrides: { root: { fontFamily: arabic ? ui : display, fontSize: '1.25rem', fontWeight: arabic ? 600 : 500, lineHeight: 1.3, letterSpacing: 0, textTransform: 'none' } } },
      MuiSkeleton: { defaultProps: { animation: 'wave' }, styleOverrides: { root: { backgroundColor: t.sunken } } },
      MuiDataGrid: {
        defaultProps: { rowHeight: t.rowHeight, columnHeaderHeight: t.rowHeight + 2 },
        styleOverrides: {
          root: {
            border: 0,
            backgroundColor: t.surface,
            '--DataGrid-rowBorderColor': t.rule,
            '--DataGrid-containerBackground': t.sunken,
            fontVariantNumeric: 'tabular-nums lining-nums',
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600, fontSize: '0.75rem', color: t.inkSecondary },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
            '& .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
            '& .MuiDataGrid-row:hover': { backgroundColor: t.brandTint },
            '& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover': { backgroundColor: t.selection },
          },
        },
      },
    },
  });
}
