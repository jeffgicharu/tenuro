import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { DateField } from '../../components/DateField.tsx';
import { DecimalInput, MoneyInput, PercentInput } from '../../components/MoneyInput.tsx';
import { fieldId, labelKey, type Path } from './model.ts';
import { useForm } from './state.tsx';

interface Common {
  path: Path;
  label?: string;
  help?: ReactNode;
  required?: boolean;
  optional?: boolean;
}

function useField(path: Path, explicitLabel?: string, optional?: boolean) {
  const intl = useIntl();
  const form = useForm();
  const key = labelKey(path);
  const base = explicitLabel ?? (intl.messages[key] ? intl.formatMessage({ id: key }) : path);
  const label = optional ? `${base} (${intl.formatMessage({ id: 'leaseForm.field.optional' })})` : base;
  const error = form.errorFor(path);
  return { form, id: fieldId(path), label, error, intl };
}

// A field's help text, from the "<label key>.help" message when it exists.
function useHelp(path: Path, help: ReactNode | undefined) {
  const intl = useIntl();
  if (help !== undefined) return help;
  const key = `${labelKey(path)}.help`;
  return intl.messages[key] ? intl.formatMessage({ id: key }) : undefined;
}

export function FormText({ path, label, help, required, optional, multiline, placeholder }: Common & { multiline?: boolean; placeholder?: string }) {
  const { form, id, label: l, error } = useField(path, label, optional);
  const helpText = useHelp(path, help);
  return (
    <TextField
      id={id}
      label={l}
      value={form.value<string>(path) ?? ''}
      onChange={(e) => form.set(path, e.target.value)}
      onBlur={() => form.touch(path)}
      error={Boolean(error)}
      helperText={error ?? helpText}
      required={required ?? false}
      fullWidth
      disabled={form.readOnly}
      {...(multiline ? { multiline: true, minRows: 3 } : {})}
      {...(placeholder ? { placeholder } : {})}
    />
  );
}

export function FormMoney({ path, label, help, required, optional, currency }: Common & { currency: string }) {
  const { form, id, label: l, error } = useField(path, label, optional);
  const helpText = useHelp(path, help);
  return (
    <MoneyInput
      id={id}
      label={l}
      currency={currency}
      value={form.value<string>(path) ?? ''}
      onChange={(v) => form.set(path, v)}
      onBlur={() => form.touch(path)}
      error={Boolean(error)}
      helperText={error ?? helpText}
      required={required ?? false}
      fullWidth
      disabled={form.readOnly}
    />
  );
}

export function FormPercent({ path, label, help, required, optional }: Common) {
  const { form, id, label: l, error } = useField(path, label, optional);
  const helpText = useHelp(path, help);
  return (
    <PercentInput
      id={id}
      label={l}
      value={form.value<string>(path) ?? ''}
      onChange={(v) => form.set(path, v)}
      onBlur={() => form.touch(path)}
      error={Boolean(error)}
      helperText={error ?? helpText}
      required={required ?? false}
      fullWidth
      disabled={form.readOnly}
    />
  );
}

export function FormNumber({ path, label, help, required, optional, places = 0, unit }: Common & { places?: number; unit?: string }) {
  const { form, id, label: l, error, intl } = useField(path, label, optional);
  const helpText = useHelp(path, help);
  const unitKey = `${labelKey(path)}.unit`;
  const suffix = unit ?? (intl.messages[unitKey] ? intl.formatMessage({ id: unitKey }) : undefined);
  return (
    <DecimalInput
      id={id}
      label={l}
      places={places}
      {...(suffix ? { suffix } : {})}
      value={form.value<string>(path) ?? ''}
      onChange={(v) => form.set(path, v)}
      onBlur={() => form.touch(path)}
      error={Boolean(error)}
      helperText={error ?? helpText}
      required={required ?? false}
      fullWidth
      disabled={form.readOnly}
    />
  );
}

export function FormDate({ path, label, help, required, optional }: Common) {
  const { form, id, label: l, error } = useField(path, label, optional);
  const helpText = useHelp(path, help);
  return (
    <DateField
      id={id}
      label={l}
      value={form.value<string>(path) ?? ''}
      onChange={(v) => { form.set(path, v); form.touch(path); }}
      onBlur={() => form.touch(path)}
      error={error}
      helperText={typeof helpText === 'string' ? helpText : undefined}
      required={required ?? false}
      disabled={form.readOnly}
    />
  );
}

export function FormSelect<T extends string>({ path, label, help, required, options }: Common & { options: { value: T; label: string }[] }) {
  const { form, id, label: l, error } = useField(path, label);
  const helpText = useHelp(path, help);
  return (
    <TextField
      select
      id={id}
      label={l}
      value={form.value<string>(path) ?? ''}
      onChange={(e) => { form.set(path, e.target.value); form.touch(path); }}
      onBlur={() => form.touch(path)}
      error={Boolean(error)}
      helperText={error ?? helpText}
      required={required ?? false}
      fullWidth
      disabled={form.readOnly}
    >
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  );
}

export function FormCheckbox({ path, label, help }: Common) {
  const { form, id, label: l, error } = useField(path, label);
  const helpText = useHelp(path, help);
  const t = useTheme().tokens;
  const helpId = `${id}-help`;
  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            id={id}
            checked={Boolean(form.value<boolean>(path))}
            onChange={(e) => { form.set(path, e.target.checked); form.touch(path); }}
            disabled={form.readOnly}
            slotProps={{ input: { 'aria-describedby': helpText || error ? helpId : undefined } as Record<string, string | undefined> }}
          />
        }
        label={l}
        sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { mt: -1 }, '& .MuiFormControlLabel-label': { fontWeight: 500, fontSize: '0.875rem', color: t.ink } }}
      />
      {(helpText || error) && (
        <FormHelperText id={helpId} error={Boolean(error)} sx={{ marginInlineStart: 8, mt: 0 }}>{error ?? helpText}</FormHelperText>
      )}
    </Box>
  );
}

// A two-column grid that collapses to one column on small screens.
// Three columns only from desktop width (two on a tablet); `template` widens a column that needs it.
export function FieldRow({ children, columns = 2, template }: { children: ReactNode; columns?: 1 | 2 | 3; template?: string }) {
  const three = template ?? 'repeat(3, minmax(0, 1fr))';
  return (
    <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: columns === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', md: columns === 3 ? three : columns === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))' } }}>
      {children}
    </Box>
  );
}

// A titled group of fields, set like a ledger section.
export function Fieldset({ legend, hint, children, action }: { legend: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  const t = useTheme().tokens;
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, mb: 8, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4, pb: 2, mb: 4, borderBottom: `1px solid ${t.rule}` }}>
        <Box component="legend" sx={{ p: 0, float: 'left', fontWeight: 600, fontSize: '0.9375rem', color: t.ink }}>{legend}</Box>
        {action}
      </Box>
      {hint && <Box sx={{ color: t.inkSecondary, fontSize: '0.8125rem', mt: -2, mb: 4, clear: 'both' }}>{hint}</Box>}
      <Box sx={{ display: 'grid', gap: 4, clear: 'both' }}>{children}</Box>
    </Box>
  );
}
