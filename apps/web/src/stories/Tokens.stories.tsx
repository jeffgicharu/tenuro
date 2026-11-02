import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

// The ledger palette and type: warm paper and ink shared by every company, with one brand hue each
// (switch it in the toolbar). Contrast of the brand against paper is guaranteed by a test.
function Palette() {
  const t = useTheme().tokens;
  const swatches: [string, string][] = [
    ['paper', t.paper], ['surface', t.surface], ['sunken', t.sunken], ['ink', t.ink], ['inkSecondary', t.inkSecondary], ['inkTertiary', t.inkTertiary],
    ['rule', t.rule], ['ruleStrong', t.ruleStrong], ['brand', t.brand], ['brandSoft', t.brandSoft], ['brandTint', t.brandTint], ['accent', t.accent],
    ['warning', t.warning], ['danger', t.danger], ['success', t.success], ['focus', t.focus],
  ];
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 3 }}>
      {swatches.map(([name, value]) => (
        <Box component="li" key={name} sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, overflow: 'hidden', backgroundColor: t.surface }}>
          <Box sx={{ height: 64, backgroundColor: value }} />
          <Box sx={{ p: 1.5, fontSize: '0.75rem' }}><strong>{name}</strong><br /><code>{value}</code></Box>
        </Box>
      ))}
      {t.chart.map((c, i) => (
        <Box component="li" key={c} sx={{ border: `1px solid ${t.rule}`, borderRadius: 1, overflow: 'hidden', backgroundColor: t.surface }}>
          <Box sx={{ height: 64, backgroundColor: c }} />
          <Box sx={{ p: 1.5, fontSize: '0.75rem' }}><strong>chart {i + 1}</strong><br /><code>{c}</code></Box>
        </Box>
      ))}
    </Box>
  );
}

function Type() {
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 720 }}>
      <Typography variant="h1">Lease register</Typography>
      <Typography variant="h2">Expiry profile</Typography>
      <Typography variant="h3">Critical dates</Typography>
      <Typography variant="body1">Body text is IBM Plex Sans (and Plex Sans Arabic); headings are Newsreader. Figures use tabular numerals so columns align.</Typography>
      <Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>KE-O-00012 · references in Plex Mono</Typography>
    </Box>
  );
}

const meta = { title: 'Foundations/Tokens', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
export const Colour: StoryObj = { render: () => <Palette /> };
export const Typography_: StoryObj = { name: 'Typography', render: () => <Type /> };
