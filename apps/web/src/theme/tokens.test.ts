import { describe, expect, it } from 'vitest';
import { contrast } from './color.ts';
import { createTokens, type Mode } from './tokens.ts';

const TENANTS = [
  { name: 'Mbuyu Court', brandHue: 138, accentHue: 70 },
  { name: 'Sunbula', brandHue: 200, accentHue: 82 },
  { name: 'Halvard & Crane', brandHue: 258, accentHue: 78 },
];

describe.each(TENANTS)('$name theme', ({ brandHue, accentHue }) => {
  describe.each(['light', 'dark'] as Mode[])('%s mode', (mode) => {
    const t = createTokens({ brandHue, accentHue, density: 'standard' }, mode);

    it('keeps body and secondary text at 4.5:1 on every surface', () => {
      for (const bg of [t.paper, t.surface, t.sunken]) {
        expect(contrast(t.ink, bg)).toBeGreaterThanOrEqual(7);
        expect(contrast(t.inkSecondary, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.inkTertiary, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('keeps the brand colour readable as text and on buttons', () => {
      for (const bg of [t.paper, t.surface]) expect(contrast(t.brand, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.brandContrast, t.brand)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.ink, t.brandSoft)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps status chip text at 4.5:1 on its own background', () => {
      for (const s of Object.values(t.status)) expect(contrast(s.fg, s.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the focus ring at 3:1 against the page', () => {
      expect(contrast(t.focus, t.paper)).toBeGreaterThanOrEqual(3);
    });

    it('keeps error text readable', () => {
      expect(contrast(t.danger, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.danger, t.dangerSoft)).toBeGreaterThanOrEqual(4.5);
    });

    it('gives charts six distinct colours with 3:1 against the surface', () => {
      expect(new Set(t.chart).size).toBe(6);
      for (const c of t.chart) expect(contrast(c, t.surface)).toBeGreaterThanOrEqual(3);
    });
  });
});
