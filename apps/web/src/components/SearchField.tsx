import { useEffect, useRef, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange(value: string): void;
  label: string;
  placeholder?: string;
  clearLabel: string;
  delay?: number;
  width?: number | string;
}

// Holds what the person types locally and reports it after a pause, so each keystroke does not
// start a query. Pressing Escape clears it; an outside change (e.g. "Clear all") resets it.
export function SearchField({ value, onChange, label, placeholder, clearLabel, delay = 250, width = 320 }: Props) {
  const t = useTheme().tokens;
  const [text, setText] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === last.current) return;
    const id = window.setTimeout(() => {
      last.current = text;
      onChange(text);
    }, delay);
    return () => window.clearTimeout(id);
  }, [text, delay, onChange]);

  const clear = () => {
    setText('');
    last.current = '';
    onChange('');
  };

  return (
    <TextField
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && text) {
          e.stopPropagation();
          clear();
        }
      }}
      placeholder={placeholder}
      type="search"
      autoComplete="off"
      sx={{ width: { xs: '100%', sm: width } }}
      slotProps={{
        htmlInput: { 'aria-label': label, maxLength: 100, enterKeyHint: 'search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} strokeWidth={1.8} color={t.inkTertiary} aria-hidden />
            </InputAdornment>
          ),
          endAdornment: text ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={clear} aria-label={clearLabel} edge="end">
                <X size={15} strokeWidth={1.8} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
          sx: { '& input::-webkit-search-cancel-button': { display: 'none' } },
        },
      }}
    />
  );
}
