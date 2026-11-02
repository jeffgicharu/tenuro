import { useId, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import { useTheme } from '@mui/material/styles';
import { ChevronDown, X } from 'lucide-react';

interface Props {
  label: string;
  // A short summary of the chosen value; when set the chip shows as active.
  summary?: string | null;
  clearLabel: string;
  onClear(): void;
  // Popover content; receives a close function for "Apply"-style controls.
  children?: (close: () => void) => ReactNode;
  // A chip with no popover toggles on click (e.g. "Open break option").
  onToggle?: () => void;
  width?: number;
}

// One filter in the register's filter bar. Inactive chips are quiet outlines; active chips carry
// their value and a separate clear button, so clearing never opens the popover.
export function FilterChip({ label, summary, clearLabel, onClear, children, onToggle, width = 280 }: Props) {
  const theme = useTheme();
  const t = theme.tokens;
  const start = theme.direction === 'rtl' ? 'right' : 'left';
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const active = summary !== undefined && summary !== null;
  const toggle = !children;

  return (
    <Box
      sx={{
        display: 'inline-flex', alignItems: 'stretch', height: 32, borderRadius: 1, overflow: 'hidden',
        border: `1px solid ${active ? t.brand : t.ruleStrong}`,
        backgroundColor: active ? t.brandSoft : t.surface,
        transition: 'border-color 120ms ease, background-color 120ms ease',
      }}
    >
      <ButtonBase
        onClick={(e) => (toggle ? onToggle?.() : setAnchor(e.currentTarget))}
        aria-haspopup={toggle ? undefined : 'dialog'}
        aria-expanded={toggle ? undefined : Boolean(anchor)}
        aria-controls={anchor ? id : undefined}
        aria-pressed={toggle ? active : undefined}
        sx={{
          px: 3, gap: 1.5, fontSize: '0.8125rem', fontWeight: 500, color: active ? t.ink : t.inkSecondary, whiteSpace: 'nowrap',
          '&:hover': { backgroundColor: active ? t.brandSoft : t.brandTint, color: t.ink },
          '&.Mui-focusVisible': { outline: `2px solid ${t.focus}`, outlineOffset: -2 },
        }}
      >
        <span>{label}</span>
        {active && summary && (
          <Box component="bdi" sx={{ color: t.brand, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</Box>
        )}
        {!toggle && !active && <ChevronDown size={14} strokeWidth={1.8} aria-hidden />}
      </ButtonBase>
      {active && (
        <IconButton
          size="small"
          onClick={onClear}
          aria-label={clearLabel}
          sx={{ borderRadius: 0, width: 28, borderInlineStart: `1px solid ${t.brand}`, color: t.brand, '&:hover': { backgroundColor: t.selection } }}
        >
          <X size={13} strokeWidth={2} />
        </IconButton>
      )}
      {children && (
        <Popover
          id={id}
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: start }}
          transformOrigin={{ vertical: -6, horizontal: start }}
          slotProps={{ paper: { role: 'dialog', 'aria-label': label, sx: { width, maxWidth: 'calc(100vw - 32px)' } } }}
        >
          {anchor && children(() => setAnchor(null))}
        </Popover>
      )}
    </Box>
  );
}
