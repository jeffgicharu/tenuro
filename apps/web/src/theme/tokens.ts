import { alpha, ensureContrast, hex, mix, oklch } from './color.ts';

export type Mode = 'light' | 'dark';
export type Density = 'compact' | 'standard' | 'comfortable';

export interface BrandInput {
  brandHue: number;
  accentHue: number;
  density: Density;
}

export interface StatusTone {
  fg: string;
  bg: string;
  border: string;
}

export interface Tokens {
  mode: Mode;
  density: Density;
  rowHeight: number;
  paper: string;
  surface: string;
  sunken: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  rule: string;
  ruleStrong: string;
  brand: string;
  brandHover: string;
  brandContrast: string;
  brandSoft: string;
  brandTint: string;
  accent: string;
  focus: string;
  selection: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  status: Record<'ACTIVE' | 'HOLDING_OVER' | 'EXPIRED' | 'TERMINATED' | 'DRAFT', StatusTone>;
  chart: string[];
}

// Warm paper and ink, the same for every company; only the brand hue changes between tenants.
const NEUTRAL = {
  light: { paper: '#F4F0E7', surface: '#FBF9F4', sunken: '#ECE6DA', ink: '#1C1A16', inkSecondary: '#55504A', inkTertiary: '#665F55', rule: '#DED7C9', ruleStrong: '#C8BFAE' },
  dark: { paper: '#16150F', surface: '#1E1C16', sunken: '#11100C', ink: '#EDE8DD', inkSecondary: '#B5AE9F', inkTertiary: '#9C9586', rule: '#2E2B23', ruleStrong: '#423E33' },
} as const;

const ROW_HEIGHT: Record<Density, number> = { compact: 34, standard: 40, comfortable: 48 };

// Status colours are shared by every tenant so a chip always means the same thing.
const STATUS = {
  light: {
    ACTIVE: ['#2E6544', '#E4EEE4'], HOLDING_OVER: ['#8A560D', '#F5EAD6'], EXPIRED: ['#5F594F', '#ECE8E0'],
    TERMINATED: ['#97361F', '#F5E3DC'], DRAFT: ['#3F5677', '#E2E8F1'],
  },
  dark: {
    ACTIVE: ['#93CFA5', '#1D2E22'], HOLDING_OVER: ['#E6B66A', '#33281A'], EXPIRED: ['#B6AFA2', '#26241F'],
    TERMINATED: ['#EE9C85', '#3A221B'], DRAFT: ['#A9BEDD', '#1E2533'],
  },
} as const;

export function createTokens(input: BrandInput, mode: Mode): Tokens {
  const n = NEUTRAL[mode];
  const dark = mode === 'dark';
  const brand = dark
    ? ensureContrast(0.78, 0.1, input.brandHue, n.paper, 4.5, 'lighter')
    : ensureContrast(0.46, 0.1, input.brandHue, n.paper, 4.5, 'darker');
  const brandHover = dark ? hex(oklch(0.84, 0.09, input.brandHue)) : hex(oklch(0.38, 0.1, input.brandHue));
  const brandContrast = dark ? n.paper : '#FFFFFF';
  const accent = dark ? hex(oklch(0.78, 0.12, input.accentHue)) : hex(oklch(0.62, 0.13, input.accentHue));
  const tone = (key: keyof typeof STATUS.light): StatusTone => {
    const [fg, bg] = STATUS[mode][key];
    return { fg, bg, border: mix(bg, fg, 0.25) };
  };
  return {
    mode,
    density: input.density,
    rowHeight: ROW_HEIGHT[input.density],
    ...n,
    brand,
    brandHover,
    brandContrast,
    brandSoft: mix(n.surface, brand, dark ? 0.16 : 0.1),
    brandTint: mix(n.paper, brand, dark ? 0.07 : 0.035),
    accent,
    focus: brand,
    selection: alpha(brand, dark ? 0.22 : 0.12),
    danger: dark ? '#F09A88' : '#A3301C',
    dangerSoft: dark ? '#3A201A' : '#F7E2DC',
    warning: dark ? '#E6B66A' : '#8A560D',
    success: dark ? '#93CFA5' : '#2E6544',
    status: { ACTIVE: tone('ACTIVE'), HOLDING_OVER: tone('HOLDING_OVER'), EXPIRED: tone('EXPIRED'), TERMINATED: tone('TERMINATED'), DRAFT: tone('DRAFT') },
    // Six hues spaced around the brand hue, held at matched lightness so no series shouts.
    chart: [0, 55, 140, 200, 265, 320].map((offset, i) =>
      hex(oklch(dark ? 0.74 : 0.56 + (i % 2) * 0.04, 0.11, (input.brandHue + offset) % 360))),
  };
}
