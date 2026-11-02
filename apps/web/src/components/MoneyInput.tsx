import { useMemo, useState, type FocusEvent } from 'react';
import { useIntl } from 'react-intl';
import InputAdornment from '@mui/material/InputAdornment';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { minorUnits } from '../i18n/format.ts';

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

// Turns whatever was typed or pasted into a plain decimal string: Arabic-Indic digits become ASCII,
// grouping separators go, and the Arabic decimal separator becomes a dot. Extra decimal digits are
// ignored as they are typed. In a currency with no minor unit (UGX, RWF) the decimals are kept
// instead, so validation can say "no decimal places": dropping the dot would merge the digits typed
// after it into the whole number and silently multiply the amount. The value never becomes a float.
export function normaliseDecimal(input: string, places: number): string {
  let s = input
    .replace(ARABIC_INDIC, (d) => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/٫/g, '.')
    .replace(/[\s,'٬  _]/g, '')
    .replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    const int = s.slice(0, dot);
    const frac = s.slice(dot + 1).replace(/\./g, '');
    s = places === 0 ? `${int}.${frac}` : `${int}.${frac.slice(0, places)}`;
  }
  return s;
}

export function formatDecimalForDisplay(value: string, locale: string, maxPlaces: number): string {
  if (!/^\d+(\.\d*)?$/.test(value)) return value;
  const frac = value.split('.')[1] ?? '';
  // Never round what was typed: a value with too many decimals is shown as entered, and flagged.
  if (frac.length > maxPlaces) return value;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Math.min(frac.length, maxPlaces),
    maximumFractionDigits: maxPlaces,
  }).format((frac === '' ? value.replace('.', '') : value) as unknown as number);
}

export type DecimalInputProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  places: number;
  prefix?: string;
  suffix?: string;
};

// A text field for exact decimals: raw digits while editing, grouped figures otherwise.
export function DecimalInput({ value, onChange, places, prefix, suffix, onBlur, onFocus, slotProps, ...rest }: DecimalInputProps) {
  const intl = useIntl();
  const rtl = useTheme().direction === 'rtl';
  const [focused, setFocused] = useState(false);
  const shown = useMemo(() => (focused ? value : formatDecimalForDisplay(value, intl.locale, places)), [focused, value, intl.locale, places]);
  return (
    <TextField
      {...rest}
      value={shown}
      onChange={(e) => onChange(normaliseDecimal(e.target.value, places))}
      onFocus={(e: FocusEvent<HTMLInputElement>) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => { setFocused(false); onBlur?.(e); }}
      slotProps={{
        ...slotProps,
        input: {
          ...(prefix ? { startAdornment: <InputAdornment position="start" sx={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}</InputAdornment> } : {}),
          ...(suffix ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> } : {}),
        },
        htmlInput: {
          inputMode: places > 0 ? 'decimal' : 'numeric',
          autoComplete: 'off',
          dir: 'ltr',
          style: { textAlign: rtl ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' },
        },
      }}
    />
  );
}

export type MoneyInputProps = Omit<DecimalInputProps, 'places' | 'prefix'> & { currency: string };

export function MoneyInput({ currency, ...rest }: MoneyInputProps) {
  return <DecimalInput {...rest} places={minorUnits(currency)} prefix={currency} />;
}

export function PercentInput(props: Omit<DecimalInputProps, 'places' | 'suffix'> & { places?: number }) {
  return <DecimalInput {...props} places={props.places ?? 4} suffix="%" />;
}
