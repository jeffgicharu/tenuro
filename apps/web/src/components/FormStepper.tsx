import { useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { Check } from 'lucide-react';

export type StepState = 'current' | 'complete' | 'issues' | 'untouched';

export interface StepperItem {
  key: string;
  label: string;
  hint?: string;
  state: StepState;
  issues: number;
}

export interface FormStepperProps {
  items: StepperItem[];
  current: string;
  onSelect: (key: string) => void;
  label: string;
  compact?: boolean;
}

// The vertical list of form sections on wide screens; a compact header with progress on phones.
export function FormStepper({ items, current, onSelect, label, compact }: FormStepperProps) {
  const intl = useIntl();
  const t = useTheme().tokens;
  const index = Math.max(0, items.findIndex((i) => i.key === current));
  const status = (item: StepperItem) =>
    item.issues > 0 && item.state !== 'untouched'
      ? intl.formatMessage({ id: 'leaseForm.stepper.issues' }, { count: item.issues })
      : item.state === 'complete' ? intl.formatMessage({ id: 'leaseForm.stepper.complete' })
        : item.state === 'untouched' ? intl.formatMessage({ id: 'leaseForm.stepper.notStarted' }) : '';

  if (compact) {
    return (
      <Box component="nav" aria-label={label} sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
          <Box sx={{ fontSize: '0.75rem', color: t.inkSecondary }} data-num>
            {intl.formatMessage({ id: 'leaseForm.stepper.progress' }, { current: index + 1, total: items.length })}
          </Box>
          <TextField
            select
            size="small"
            value={current}
            onChange={(e) => onSelect(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': label } }}
            sx={{ minWidth: 180, '& .MuiSelect-select': { fontSize: 16 } }}
          >
            {items.map((item, i) => (
              <MenuItem key={item.key} value={item.key}>
                {i + 1}. {item.label}{item.issues > 0 && item.state !== 'untouched' ? ` · ${status(item)}` : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <LinearProgress variant="determinate" value={((index + 1) / items.length) * 100} aria-hidden sx={{ height: 3, borderRadius: 2, backgroundColor: t.sunken }} />
      </Box>
    );
  }

  return (
    <Box component="nav" aria-label={label}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
        {items.map((item, i) => {
          const isCurrent = item.key === current;
          const hasIssues = item.issues > 0 && item.state !== 'untouched' && !isCurrent;
          const done = item.state === 'complete' && !isCurrent;
          return (
            <Box component="li" key={item.key} sx={{ position: 'relative' }}>
              {i < items.length - 1 && (
                <Box aria-hidden sx={{ position: 'absolute', insetInlineStart: 15, top: 34, bottom: -2, width: '1px', backgroundColor: done ? t.brand : t.rule }} />
              )}
              <ButtonBase
                onClick={() => onSelect(item.key)}
                aria-current={isCurrent ? 'step' : undefined}
                sx={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 3, py: 2, px: 0, textAlign: 'start', borderRadius: 1,
                  '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 },
                  '&:hover .step-label': { color: t.ink },
                }}
              >
                <Box
                  aria-hidden
                  data-num
                  sx={{
                    width: 31, height: 31, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 600,
                    border: `1px solid ${isCurrent ? t.ink : done ? t.brand : hasIssues ? t.danger : t.ruleStrong}`,
                    backgroundColor: isCurrent ? t.ink : done ? t.brand : t.surface,
                    color: isCurrent ? t.paper : done ? t.brandContrast : hasIssues ? t.danger : t.inkSecondary,
                    transition: 'background-color 160ms ease, border-color 160ms ease',
                  }}
                >
                  {done ? <Check size={15} strokeWidth={2.4} /> : i + 1}
                </Box>
                <Box sx={{ minWidth: 0, pt: 0.5 }}>
                  <Box className="step-label" sx={{ fontWeight: isCurrent ? 600 : 500, fontSize: '0.875rem', color: isCurrent ? t.ink : t.inkSecondary, transition: 'color 120ms ease' }}>
                    {item.label}
                  </Box>
                  <Box sx={{ fontSize: '0.75rem', color: hasIssues ? t.danger : t.inkTertiary, mt: 0.25 }}>
                    {hasIssues || done ? status(item) : item.hint}
                  </Box>
                  <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {!hasIssues && !done ? `, ${status(item)}` : ''}
                  </Box>
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
