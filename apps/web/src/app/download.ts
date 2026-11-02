// Downloads rows as a CSV file. Values are quoted where needed and formula-leading cells are
// escaped, so a spreadsheet never runs text from the data as a formula. A byte-order mark lets Excel
// read Arabic and other non-Latin text correctly.
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: readonly (readonly (string | number | null | undefined)[])[]): void {
  downloadBlob(filename, new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
