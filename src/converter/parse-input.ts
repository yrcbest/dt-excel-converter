import { DataTableRow, NSLocTextMeta, parseNSLocText } from '../types';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function coerceValue(value: string): unknown {
  if (value === '') return '';

  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  if (/^-?\d+$/.test(value)) {
    const n = parseInt(value, 10);
    if (isFinite(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    const n = parseFloat(value);
    if (isFinite(n)) return n;
  }

  return value;
}

export function parseJSON(text: string): { rows: DataTableRow[]; nsLocText: NSLocTextMeta } {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('JSON 格式错误：根级必须是数组');
  }

  const nsLocText: NSLocTextMeta = {};
  const rows = data.map((item: unknown, index: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`第 ${index + 1} 项不是有效的对象`);
    }
    const obj = item as Record<string, unknown>;
    const name = obj.Name !== undefined ? String(obj.Name) : `Row_${index + 1}`;
    const row: DataTableRow = { Name: name };

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'Name') continue;

      if (typeof value === 'string') {
        const ns = parseNSLocText(value);
        if (ns) {
          row[key] = ns.source;
          if (!nsLocText[key]) nsLocText[key] = {};
          nsLocText[key][name] = { package: ns.pkg, key: ns.key };
          continue;
        }
      }

      row[key] = value;
    }

    return row;
  });

  return { rows, nsLocText };
}

export function parseCSV(text: string): { rows: DataTableRow[]; nsLocText: NSLocTextMeta } {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV 格式错误：至少需要表头和一行数据');
  }

  const headers = parseCSVLine(lines[0]);
  const nsLocText: NSLocTextMeta = {};
  const rows: DataTableRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const name = values[0] || `Row_${i}`;
    const row: DataTableRow = { Name: name };

    for (let j = 1; j < headers.length && j < values.length; j++) {
      const header = headers[j].trim();
      if (!header) continue;

      const rawValue = coerceValue(values[j]);
      if (typeof rawValue === 'string') {
        const ns = parseNSLocText(rawValue);
        if (ns) {
          row[header] = ns.source;
          if (!nsLocText[header]) nsLocText[header] = {};
          nsLocText[header][name] = { package: ns.pkg, key: ns.key };
          continue;
        }
      }
      row[header] = rawValue;
    }

    rows.push(row);
  }

  return { rows, nsLocText };
}
