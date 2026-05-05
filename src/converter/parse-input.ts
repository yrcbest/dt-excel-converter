import { DataTableRow, NSLocTextMeta, parseNSLocText } from '../types';
import { flattenRow, FlatRow } from './nested';

/**
 * Parse UE DataTable JSON, flattening nested objects/arrays into dot-notation flat rows.
 * Detects NSLOCTEXT values and extracts source text + metadata.
 */
export function parseJSON(text: string): { rows: DataTableRow[]; nsLocText: NSLocTextMeta } {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('JSON 格式错误：根级必须是数组');
  }

  const nsLocText: NSLocTextMeta = {};
  const allFlat: FlatRow[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item !== 'object' || item === null) {
      throw new Error(`第 ${i + 1} 项不是有效的对象`);
    }
    const obj = item as Record<string, unknown>;
    const name = obj.Name !== undefined ? String(obj.Name) : `Row_${i + 1}`;

    // Flatten nested structures
    const flat = flattenRow(obj);
    flat.Name = name;
    allFlat.push(flat);
  }

  // Detect NSLOCTEXT in all leaf values
  for (const flat of allFlat) {
    const rowName = String(flat.Name);
    for (const [key, value] of Object.entries(flat)) {
      if (key === 'Name') continue;
      if (typeof value === 'string') {
        const ns = parseNSLocText(value);
        if (ns) {
          flat[key] = ns.source;
          if (!nsLocText[key]) nsLocText[key] = {};
          nsLocText[key][rowName] = { package: ns.pkg, key: ns.key };
        }
      }
    }
  }

  return { rows: allFlat as DataTableRow[], nsLocText };
}
