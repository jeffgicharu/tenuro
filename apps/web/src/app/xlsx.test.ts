import { describe, expect, it } from 'vitest';
import { buildXlsx, crc32 } from './xlsx.ts';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('XLSX writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('writes a ZIP with the workbook parts, numbers as numbers and text escaped', () => {
    const bytes = buildXlsx([{ name: 'Rent roll', rows: [['Reference', 'Rent'], ['KE-O-00012 <&>', 1250000.5], ['=SUM(A1)', null]] }]);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const s = text(bytes);
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) expect(s).toContain(part);
    expect(s).toContain('<sheet name="Rent roll"');
    expect(s).toContain('<v>1250000.5</v>');
    expect(s).toContain('KE-O-00012 &lt;&amp;&gt;');
    // Formula-looking text is stored as an inline string, never as a formula.
    expect(s).toContain('<t xml:space="preserve">=SUM(A1)</t>');
    expect(s).not.toContain('<f>');
    expect(s).toContain('state="frozen"');
  });
});
