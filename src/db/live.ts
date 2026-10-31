/**
 * Re-read data whenever any of the given tables change. Unlike drizzle's useLiveQuery (which only
 * watches a query's main table), this suits reads that span tables, e.g. accounts + their totals.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useRef, useSyncExternalStore } from 'react';

export type TableName =
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'recurring_rules'
  | 'installment_plans'
  | 'statements'
  | 'import_batches'
  | 'csv_mappings'
  | 'settings';

const versions = new Map<string, number>();
const listeners = new Set<() => void>();
let subscription: { remove(): void } | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscription ??= addDatabaseChangeListener(({ tableName }) => {
    versions.set(tableName, (versions.get(tableName) ?? 0) + 1);
    listeners.forEach((l) => l());
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = undefined;
    }
  };
}

/**
 * `read` runs synchronously against the repositories. It re-runs when a watched table changes or
 * when `read` itself changes (the React Compiler gives it a new identity when its inputs change).
 */
export function useLiveData<T>(read: () => T, tables: readonly TableName[]): T {
  const cache = useRef<{ key: string; read: () => T; value: T } | null>(null);
  const tableKey = tables.join(',');

  const getSnapshot = useCallback(() => {
    const key = tableKey
      .split(',')
      .map((t) => versions.get(t) ?? 0)
      .join(':');
    if (!cache.current || cache.current.key !== key || cache.current.read !== read) {
      cache.current = { key, read, value: read() };
    }
    return cache.current.value;
  }, [read, tableKey]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
