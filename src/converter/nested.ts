/**
 * Flatten nested objects/arrays into dot-notation flat keys.
 *
 * Example:
 *   {name: "John", address: {city: "NY", codes: [{z: "1"}, {z: "2"}]}}
 *   → {name: "John", address.city: "NY", address.codes.0.z: "1", address.codes.1.z: "2"}
 */

export type FlatRow = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function flattenValue(key: string, value: unknown, prefix: string, out: FlatRow): void {
  const fullKey = prefix ? `${prefix}.${key}` : key;

  // Skip null/undefined — don't emit phantom columns
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value !== 'object') {
    out[fullKey] = value;
    return;
  }

  if (Array.isArray(value)) {
    // Empty arrays are silently skipped (no phantom column)
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (isRecord(item)) {
        flattenObject(item, `${fullKey}.${i}`, out);
      } else {
        out[`${fullKey}.${i}`] = item ?? '';
      }
    }
    return;
  }

  // Object
  flattenObject(value as Record<string, unknown>, fullKey, out);
}

function flattenObject(obj: Record<string, unknown>, prefix: string, out: FlatRow): void {
  for (const [key, value] of Object.entries(obj)) {
    flattenValue(key, value as unknown, prefix, out);
  }
}

export function flattenRow(obj: Record<string, unknown>): FlatRow {
  const out: FlatRow = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'Name') {
      out.Name = value;
      continue;
    }
    flattenValue(key, value, '', out);
  }
  return out;
}

/**
 * Collect all unique flat keys across all rows (preserving first-seen order, Name first).
 */
export function collectFlatKeys(rows: FlatRow[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  const add = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  };
  add('Name');
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      add(k);
    }
  }
  return keys;
}

/**
 * Unflatten dot-notation keys back into nested objects/arrays.
 *
 * path.0.child → path[0].child (array element)
 * path.key    → path.key (object property)
 *
 * Adjacent numeric indices under the same parent are merged into arrays.
 */

function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    target[path[0]] = value;
    return;
  }

  const head = path[0];
  const rest = path.slice(1);

  if (!(head in target)) {
    target[head] = /^\d+$/.test(rest[0]) ? [] : {};
  }

  const child = target[head];
  if (Array.isArray(child)) {
    const idx = parseInt(rest[0], 10);
    if (!isNaN(idx)) {
      if (rest.length === 1) {
        child[idx] = value;
      } else {
        const rest2 = rest.slice(1);
        if (child[idx] === undefined) {
          child[idx] = /^\d+$/.test(rest2[0]) ? [] : {};
        }
        setNested(child[idx] as Record<string, unknown>, rest2, value);
      }
      return;
    }
  }

  setNested(child as Record<string, unknown>, rest, value);
}

function convertArrays(obj: unknown): unknown {
  if (!isRecord(obj)) {
    if (Array.isArray(obj)) {
      return obj.map(convertArrays);
    }
    return obj;
  }

  const keys = Object.keys(obj);
  const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));

  if (allNumeric) {
    const arr: unknown[] = [];
    for (const k of keys) {
      arr[parseInt(k, 10)] = convertArrays(obj[k]);
    }
    return arr;
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = convertArrays(v);
  }
  return result;
}

export function unflattenRow(flat: FlatRow): FlatRow {
  const result: FlatRow = {};

  for (const [key, value] of Object.entries(flat)) {
    if (key === 'Name') {
      result.Name = value;
      continue;
    }

    const parts = key.split('.');
    setNested(result, parts, value === '' ? '' : value);
  }

  return convertArrays(result) as FlatRow;
}

/**
 * Recursively remove empty strings, empty objects, and empty arrays.
 * Returns `undefined` if the value (or all children) are empty.
 */
export function pruneEmpty(obj: unknown): unknown {
  if (obj === null || obj === undefined || obj === '') return undefined;
  if (Array.isArray(obj)) {
    const filtered = obj.map(pruneEmpty).filter(v => v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = pruneEmpty(v);
      if (cleaned !== undefined) result[k] = cleaned;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return obj;
}
