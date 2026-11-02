import dayjs, { type Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

export interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  error?: string | undefined;
  helperText?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
}

// Calendar dates in and out as YYYY-MM-DD strings. A half-typed or impossible date is passed on as
// "invalid", so validation can say so instead of silently clearing the field.
export function DateField({ id, label, value, onChange, onBlur, error, helperText, required, disabled, minDate, maxDate }: DateFieldProps) {
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayjs(value) : null;
  return (
    <DatePicker
      label={label}
      value={parsed}
      disabled={disabled ?? false}
      {...(minDate ? { minDate: dayjs(minDate) } : {})}
      {...(maxDate ? { maxDate: dayjs(maxDate) } : {})}
      onChange={(d: Dayjs | null) => onChange(d === null ? '' : d.isValid() ? d.format('YYYY-MM-DD') : 'invalid')}
      onClose={() => onBlur?.()}
      slotProps={{
        textField: {
          id,
          required: required ?? false,
          error: Boolean(error),
          helperText: error ?? helperText,
          onBlur: () => onBlur?.(),
          fullWidth: true,
          size: 'small',
        },
      }}
    />
  );
}
