import { DataTableRow } from '../types';

export function formatAsJSON(rows: DataTableRow[]): string {
  return JSON.stringify(rows, null, 2);
}
