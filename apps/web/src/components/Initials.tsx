import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

// People are shown by their initials only; the seed data has no portraits.
export function Initials({ text, size = 32, title }: { text: string; size?: number; title?: string }) {
  const t = useTheme().tokens;
  return (
    <Box
      component="span"
      aria-hidden={title ? undefined : true}
      title={title}
      sx={{
        width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.brandSoft, color: t.brand, fontWeight: 600, fontSize: size * 0.38, letterSpacing: '0.02em',
        border: `1px solid ${t.rule}`,
      }}
    >
      {text}
    </Box>
  );
}
