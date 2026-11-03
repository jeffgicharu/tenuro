import { describe, expect, it } from 'vitest';
import { neighbourName, renderPlan } from './rendered.ts';

const texts = (svg: string) => [...svg.matchAll(/<text[^>]*\by="([\d.]+)"[^>]*>([^<]*)</g)].map((m) => ({ y: Number(m[1]), text: m[2]! }));

describe('demise plan', () => {
  it('draws a shop on a frontage, with no lift core, under its own name', () => {
    const svg = renderPlan({ reference: 'NL-R-01154', premises: 'Shop 1-34', property_name: 'Atrium', area_sqm: '120', property_type: 'RETAIL' }, 'en');
    expect(svg).toContain('Shop 1-34');
    expect(svg).toContain('MALL WALKWAY'); // level 1, so it faces the walkway rather than a street
    expect(svg).not.toContain('Lifts');
    expect(svg).not.toMatch(/Unit \d+\.\d+/);
    expect(svg).toContain('Shop 1-35'); // neighbours follow the premises' numbering
  });

  it('puts a ground-floor shop on a street', () => {
    const svg = renderPlan({ reference: 'X', premises: 'Shop G-05', property_name: 'P', area_sqm: '60', property_type: 'RETAIL' }, 'en');
    expect(svg).toContain('STREET FRONTAGE');
  });

  it('draws a warehouse unit facing a service yard', () => {
    const svg = renderPlan({ reference: 'X', premises: 'Unit 15', property_name: 'P', area_sqm: '900', property_type: 'WAREHOUSE' }, 'en');
    expect(svg).toContain('SERVICE YARD');
    expect(svg).not.toContain('Lifts');
  });

  it('labels the area on its own line, with no stray separator', () => {
    const svg = renderPlan({ reference: 'X', premises: 'Level 9, North', property_name: 'P', area_sqm: '256', property_type: 'OFFICE' }, 'en');
    expect(svg).toContain('≈ 256 m²');
    expect(svg).not.toContain('· ≈');
    expect(svg).toContain('Level 9, North');
  });

  // Regression: "Lifts" and "WCs" were placed from opposite ends of the core and printed on top of
  // each other when the core was drawn small.
  it('keeps the core labels apart at every size', () => {
    for (const area of ['40', '120', '400', '1500']) {
      const t = texts(renderPlan({ reference: 'GB-O-00001', premises: 'Level 3, East', property_name: 'P', area_sqm: area, property_type: 'OFFICE' }, 'en'));
      const lifts = t.find((x) => x.text === 'Lifts')!; const wcs = t.find((x) => x.text === 'WCs')!;
      expect(Math.abs(wcs.y - lifts.y), `area ${area}`).toBeGreaterThanOrEqual(12);
    }
  });

  it('numbers neighbours from the premises name', () => {
    expect(neighbourName('Shop G-05', 1)).toBe('Shop G-06');
    expect(neighbourName('محل 12، الطابق الأول', -1)).toBe('محل 11، الطابق الأول');
    expect(neighbourName('Unit 1', -2)).toBeNull();
  });
});
