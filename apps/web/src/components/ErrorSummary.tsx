import { forwardRef, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { AlertCircle } from 'lucide-react';

export interface SummaryItem {
  key: string;
  label: string;
  message: string;
  target: string;
  onSelect?: () => void;
}

// A list of what needs fixing, at the top of the step. Each entry links to its field and moves focus
// there; it takes focus itself when shown, so screen readers announce it.
export const ErrorSummary = forwardRef<HTMLDivElement, { title: string; items: SummaryItem[] }>(function ErrorSummary({ title, items }, ref) {
  const t = useTheme().tokens;
  const go = (e: MouseEvent<HTMLAnchorElement>, item: SummaryItem) => {
    e.preventDefault();
    item.onSelect?.();
    // Wait for a step change to render before moving focus.
    window.setTimeout(() => {
      const el = document.getElementById(item.target);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, item.onSelect ? 60 : 0);
  };
  return (
    <Box
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      sx={{ border: `1px solid ${t.danger}`, borderInlineStartWidth: 4, backgroundColor: t.dangerSoft, borderRadius: 1, p: 4, mb: 6, outline: 'none', '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 } }}
    >
      <Box id="error-summary-title" sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600, color: t.danger, mb: 2 }}>
        <AlertCircle size={17} strokeWidth={2} aria-hidden />
        {title}
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
        {items.map((item) => (
          <li key={item.key}>
            <Box
              component="a"
              href={`#${item.target}`}
              onClick={(e: MouseEvent<HTMLAnchorElement>) => go(e, item)}
              sx={{ color: t.ink, fontSize: '0.875rem', textDecoration: 'underline', textDecorationColor: t.danger, textUnderlineOffset: 3, '&:focus-visible': { outline: `2px solid ${t.focus}`, outlineOffset: 2 } }}
            >
              <strong>{item.label}:</strong> {item.message}
            </Box>
          </li>
        ))}
      </Box>
    </Box>
  );
});
