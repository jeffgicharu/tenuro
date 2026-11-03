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

  it('labels Arabic neighbouring shops by number, so the labels fit', () => {
    const svg = renderPlan({ reference: 'BH-R-01968', premises: 'محل 48، الطابق الثاني', property_name: 'واحة', area_sqm: '196', property_type: 'RETAIL' }, 'ar');
    for (const n of [46, 47, 49, 50]) expect(svg).toContain(`>محل ${n}<`);
    expect(svg).toContain('ممر المركز التجاري');
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

  it('draws a whole-floor demise as one hatched area with a single label and no unit partitions', () => {
    for (const premises of ['Level 7, Whole floor', 'الطابق 3، الطابق كاملاً']) {
      const svg = renderPlan({ reference: 'SA-O-00311', premises, property_name: 'P', area_sqm: '276', property_type: 'OFFICE' }, premises.startsWith('L') ? 'en' : 'ar');
      expect(svg.match(/fill="url\(#h\)"/g)).toHaveLength(1);
      expect(svg.match(/>(المساحة المؤجرة|Demised premises)</g)).toHaveLength(1);
      expect(svg).not.toMatch(/>(Unit|وحدة) \d+\.\d+</);
    }
  });

  it('keeps the lift cars inside the core', () => {
    const svg = renderPlan({ reference: 'GB-O-00488', premises: 'Level 2, Wing A', property_name: 'P', area_sqm: '71', property_type: 'OFFICE' }, 'en');
    const core = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#ece6da" stroke="#1c1a16" stroke-width="2"\/>/.exec(svg)!;
    const right = Number(core[1]) + Number(core[2]);
    const cars = [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#fffdf8" stroke="#1c1a16"\/><line/g)];
    expect(cars).toHaveLength(3);
    for (const c of cars) expect(Number(c[1]) + Number(c[2])).toBeLessThanOrEqual(right + 0.5);
  });

  it('numbers neighbours from the premises name', () => {
    expect(neighbourName('Shop G-05', 1)).toBe('Shop G-06');
    expect(neighbourName('محل 12، الطابق الأول', -1)).toBe('محل 11، الطابق الأول');
    expect(neighbourName('Unit 1', -2)).toBeNull();
  });
});
