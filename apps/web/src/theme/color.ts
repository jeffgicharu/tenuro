// OKLCH colour maths: each tenant gives one brand hue and the theme derives every colour from it,
// adjusting lightness until the WCAG contrast target is met.

export type Rgb = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToLinear(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// Lowers chroma until the colour fits in sRGB, keeping lightness and hue.
export function oklch(l: number, c: number, h: number): Rgb {
  let lo = 0;
  let hi = c;
  if (inGamut(oklchToLinear(l, c, h))) lo = c;
  else {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(l, mid, h))) lo = mid;
      else hi = mid;
    }
  }
  return oklchToLinear(l, lo, h).map((v) => Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v)))))) as Rgb;
}

export const hex = (rgb: Rgb) => `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

export function parseHex(h: string): Rgb {
  const n = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as Rgb;
}

export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Steps lightness towards the target direction until `against` reaches the contrast ratio.
export function ensureContrast(l: number, c: number, h: number, against: string, ratio: number, direction: 'darker' | 'lighter'): string {
  let lightness = l;
  for (let i = 0; i < 60; i++) {
    const colour = hex(oklch(lightness, c, h));
    if (contrast(colour, against) >= ratio) return colour;
    lightness += direction === 'darker' ? -0.01 : 0.01;
  }
  return direction === 'darker' ? '#000000' : '#FFFFFF';
}

export function mix(a: string, b: string, amount: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  return hex(ra.map((v, i) => v + (rb[i]! - v) * amount) as Rgb);
}

export function alpha(colour: string, a: number): string {
  const [r, g, b] = parseHex(colour).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
