import * as XLSX from 'xlsx';
import { DataTableRow, NSLocTextMeta, buildNSLocText } from '../types';
import { unflattenRow, collectFlatKeys, pruneEmpty } from './nested';

const PKG_SUFFIX = ' (package)';
const KEY_SUFFIX = ' (key)';

function generateNSKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

interface NSColumnInfo {
  field: string;
  srcIdx: number;
  pkgIdx: number;
  keyIdx: number;
}

function detectNSColumns(rawHeaders: string[]): NSColumnInfo[] {
  const result: NSColumnInfo[] = [];

  for (let i = 0; i < rawHeaders.length; i++) {
    const h = rawHeaders[i];
    if (h.endsWith(PKG_SUFFIX)) {
      const baseName = h.slice(0, -PKG_SUFFIX.length);
      const srcIdx = rawHeaders.indexOf(baseName);
      const keyName = baseName + KEY_SUFFIX;
      const keyIdx = rawHeaders.indexOf(keyName);
      if (srcIdx >= 0 && keyIdx >= 0 && srcIdx !== i && keyIdx !== i) {
        result.push({ field: baseName, srcIdx, pkgIdx: i, keyIdx });
      }
    }
  }
  return result;
}

export function parseExcel(buffer: ArrayBuffer): { rows: DataTableRow[]; flatRows: DataTableRow[]; nsLocText: NSLocTextMeta } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (data.length < 2) {
    throw new Error('Excel 文件至少需要包含表头和一行数据');
  }

  const rawHeaders: string[] = (data[0] as unknown[]).map(h => String(h ?? '').trim());
  const nsColumns = detectNSColumns(rawHeaders);

  const skipForFields = new Set<number>();
  for (const col of nsColumns) {
    skipForFields.add(col.pkgIdx);
    skipForFields.add(col.keyIdx);
  }

  // Build field list from non-skipped headers (index 0 is Name)
  const fields: { field: string; idx: number }[] = [];
  for (let i = 1; i < rawHeaders.length; i++) {
    if (!skipForFields.has(i)) {
      fields.push({ field: rawHeaders[i], idx: i });
    }
  }

  const nsLocText: NSLocTextMeta = {};
  const flatRows: DataTableRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const allEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
    if (allEmpty) continue;

    const name = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : `Row_${i}`;
    const obj: DataTableRow = { Name: name };

    for (const { field, idx } of fields) {
      if (idx < row.length && row[idx] !== undefined && row[idx] !== null) {
        obj[field] = row[idx];
      }
    }

    // Read NSLOCTEXT metadata from companion columns
    for (const col of nsColumns) {
      if (col.pkgIdx < row.length && col.keyIdx < row.length) {
        const pkgVal = row[col.pkgIdx] !== undefined && row[col.pkgIdx] !== null
          ? String(row[col.pkgIdx]).trim() : '';
        const keyVal = row[col.keyIdx] !== undefined && row[col.keyIdx] !== null
          ? String(row[col.keyIdx]).trim() : '';
        if (pkgVal && keyVal) {
          if (!nsLocText[col.field]) nsLocText[col.field] = {};
          nsLocText[col.field][name] = { package: pkgVal, key: keyVal };
        }
      }
    }

    flatRows.push(obj);
  }

  // Auto-generate missing package/key for new rows
  for (const [field, rowMap] of Object.entries(nsLocText)) {
    let existingPkg = '';
    for (const entry of Object.values(rowMap)) {
      if (entry.package) { existingPkg = entry.package; break; }
    }
    if (!existingPkg) continue;

    for (const row of flatRows) {
      const val = row[field];
      if (val !== undefined && val !== null && val !== '') {
        if (!rowMap[row.Name] || !rowMap[row.Name].package) {
          if (!rowMap[row.Name]) rowMap[row.Name] = { package: '', key: '' };
          rowMap[row.Name].package = existingPkg;
          rowMap[row.Name].key = generateNSKey();
        }
      }
    }
  }

  // Embed NSLOCTEXT strings into flat values before unflattening
  for (const row of flatRows) {
    for (const [field, rowMap] of Object.entries(nsLocText)) {
      const ns = rowMap[row.Name as string];
      if (ns && row[field] !== undefined && row[field] !== null && row[field] !== '') {
        row[field] = buildNSLocText(ns.package, ns.key, String(row[field]));
      }
    }
  }

  // Fill missing flat keys across all rows so every row has the same structure
  const allKeys = collectFlatKeys(flatRows);
  for (const row of flatRows) {
    for (const key of allKeys) {
      if (!(key in row)) {
        row[key] = '';
      }
    }
  }

  // Unflatten each row back to nested structure
  const unpruned = flatRows.map(r => unflattenRow(r) as Record<string, unknown>);

  // Collect top-level schema (all keys appearing in any row)
  const schemaKeys = new Set<string>();
  const schemaTypes = new Map<string, 'object' | 'array' | 'primitive'>();
  for (const row of unpruned) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Name') continue;
      schemaKeys.add(key);
      if (!schemaTypes.has(key)) {
        if (Array.isArray(value)) schemaTypes.set(key, 'array');
        else if (typeof value === 'object' && value !== null) schemaTypes.set(key, 'object');
        else schemaTypes.set(key, 'primitive');
      }
    }
  }

  // Prune deep empty leaves, then normalize top-level keys for UE schema consistency
  const rows = unpruned.map(row => {
    const cleaned = pruneEmpty(row) as Record<string, unknown> ?? { Name: row.Name };
    for (const key of schemaKeys) {
      if (!(key in cleaned)) {
        const type = schemaTypes.get(key) || 'primitive';
        cleaned[key] = type === 'array' ? [] : type === 'object' ? {} : '';
      }
    }
    return cleaned as DataTableRow;
  });

  return { rows, flatRows, nsLocText: {} };
}
