import { describe, expect, it } from 'vitest';
import { KINDS, kindColour } from './urlState.ts';

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('key date kind colours', () => {
  it('keep each kind on the same hue in light and dark, and tell kinds apart', () => {
    for (const k of KINDS) {
      const diff = Math.abs(hue(kindColour('light', k)) - hue(kindColour('dark', k)));
      expect(Math.min(diff, 360 - diff), k).toBeLessThan(15);
    }
    expect(new Set(KINDS.map((k) => kindColour('light', k))).size).toBe(KINDS.length);
  });
});
