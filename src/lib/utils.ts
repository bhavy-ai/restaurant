import { Table } from '../types';

/** Safely extract table_number from a joined table relation. */
export function getTableNumber(table: Table | Record<string, unknown> | null | undefined): string {
  if (!table) return 'N/A';
  const num = (table as { table_number?: number }).table_number;
  return num !== undefined ? `Table ${num}` : 'N/A';
}
