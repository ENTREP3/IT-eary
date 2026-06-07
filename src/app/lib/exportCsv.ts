function escCell(v: string | number | boolean | undefined) {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Save UTF-8 CSV with Excel-friendly BOM. */
export function downloadCsvFile(filename: string, headers: string[], rows: (string | number | boolean | undefined)[][]) {
  const lines = [headers.map(escCell).join(',')];
  for (const r of rows) lines.push(r.map(escCell).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function buildAnalyticsCsv(sections: { title: string; headers: string[]; rows: (string | number | boolean | undefined)[][] }[]) {
  const out: string[] = [];
  for (const s of sections) {
    out.push(s.title);
    out.push(s.headers.map(escCell).join(','));
    for (const r of s.rows) out.push(r.map(escCell).join(','));
    out.push('');
  }
  return `\uFEFF${out.join('\r\n')}`;
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
