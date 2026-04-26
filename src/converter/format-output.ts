import { DataTableRow, NSLocTextMeta, buildNSLocText } from '../types';

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatCellValue(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  return escapeCSV(String(val));
}

export function formatAsJSON(rows: DataTableRow[], nsLocText: NSLocTextMeta = {}): string {
  const output = rows.map(row => {
    const obj: Record<string, unknown> = { Name: row.Name };
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Name') continue;
      const ns = nsLocText[key]?.[row.Name];
      if (ns) {
        obj[key] = buildNSLocText(ns.package, ns.key, String(value ?? ''));
      } else {
        obj[key] = value;
      }
    }
    return obj;
  });
  return JSON.stringify(output, null, 2);
}

export function formatAsCSV(rows: DataTableRow[], nsLocText: NSLocTextMeta = {}): string {
  if (rows.length === 0) return '﻿';

  const fieldSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'Name') fieldSet.add(key);
    }
  }
  const fields = Array.from(fieldSet);

  const lines: string[] = [];
  lines.push(['Name', ...fields].join(','));

  for (const row of rows) {
    const values = [escapeCSV(row.Name)];
    for (const field of fields) {
      const val = row[field];
      const ns = nsLocText[field]?.[row.Name];
      if (ns) {
        values.push(escapeCSV(buildNSLocText(ns.package, ns.key, String(val ?? ''))));
      } else {
        values.push(formatCellValue(val));
      }
    }
    lines.push(values.join(','));
  }

  return '﻿' + lines.join('\r\n');
}
