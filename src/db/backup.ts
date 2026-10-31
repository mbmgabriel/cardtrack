/**
 * Full backup and restore (PLAN.md Phase 8): every table as JSON plus the schema version.
 * Restoring replaces all data in one database transaction, so a bad file changes nothing.
 */
import journal from '../../drizzle/meta/_journal.json';

import { isCents } from '@/domain/money';
import { nowTimestamp } from '@/utils/id';

import {
  accounts,
  categories,
  csvMappings,
  importBatches,
  installmentPlans,
  recurringRules,
  settings,
  statements,
  transactions,
} from './schema';
import type { AppDatabase } from './types';

export const BACKUP_FORMAT = 'cardtrack-backup';
/** One step per database migration; a backup records the version it was made with. */
export const SCHEMA_VERSION = journal.entries.length;

/** Tables in insert order (each only references tables before it). */
const TABLES = {
  categories,
  accounts,
  importBatches,
  recurringRules,
  installmentPlans,
  statements,
  transactions,
  csvMappings,
  settings,
} as const;
type TableKey = keyof typeof TABLES;
const TABLE_KEYS = Object.keys(TABLES) as TableKey[];

export type BackupTables = { [K in TableKey]: Record<string, unknown>[] };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
};

export type BackupProblem = 'notJson' | 'notBackup' | 'newerVersion' | 'damaged';

/**
 * Upgrades a backup made with an older schema, one version at a time. Add a step here with each
 * migration that changes a table's shape (e.g. `2: (tables) => ({ ...tables, newColumn… })`).
 */
const UPGRADES: Record<number, (tables: BackupTables) => BackupTables> = {};

export function upgradeBackup(backup: Backup): Backup {
  let tables = backup.tables;
  for (let v = backup.schemaVersion + 1; v <= SCHEMA_VERSION; v++) {
    tables = UPGRADES[v]?.(tables) ?? tables;
  }
  return { ...backup, schemaVersion: SCHEMA_VERSION, tables };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `…Cents` field must be an integer (or null): money is never a float (§3.1). */
function hasValidMoney(row: Record<string, unknown>): boolean {
  return Object.entries(row).every(
    ([key, value]) => !key.endsWith('Cents') || value === null || isCents(value),
  );
}

/** Read a backup file's text, checking its shape and upgrading older versions. */
export function parseBackup(
  text: string,
): { ok: true; backup: Backup } | { ok: false; problem: BackupProblem } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'notJson' };
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT || !isRecord(data.tables)) {
    return { ok: false, problem: 'notBackup' };
  }
  const version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, problem: 'notBackup' };
  }
  if (version > SCHEMA_VERSION) return { ok: false, problem: 'newerVersion' };
  const tables = { ...data.tables };
  for (const key of TABLE_KEYS) {
    // A table added after this backup was made simply starts out empty.
    if (tables[key] === undefined && version < SCHEMA_VERSION) tables[key] = [];
    const rows = tables[key];
    if (!Array.isArray(rows) || !rows.every((r) => isRecord(r) && hasValidMoney(r))) {
      return { ok: false, problem: 'damaged' };
    }
  }
  return {
    ok: true,
    backup: upgradeBackup({
      format: BACKUP_FORMAT,
      schemaVersion: version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      tables: tables as BackupTables,
    }),
  };
}

/** Parents before children, so the self-reference never points at a missing row. */
function parentsFirst(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const ids = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => r.parentId == null || !ids.has(r.parentId));
  const children = rows.filter((r) => !roots.includes(r));
  return [...roots, ...children];
}

export function createBackupService(db: AppDatabase) {
  return {
    exportAll(): Backup {
      const tables = Object.fromEntries(
        TABLE_KEYS.map((key) => [key, db.select().from(TABLES[key]).all()]),
        // Typed rows become plain records: they only leave the app as JSON.
      ) as unknown as BackupTables;
      return {
        format: BACKUP_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: nowTimestamp(),
        tables,
      };
    },

    /** Replace everything with the backup. Throws (and changes nothing) if a row is invalid. */
    restore(backup: Backup): void {
      db.transaction((tx) => {
        for (const key of [...TABLE_KEYS].reverse()) tx.delete(TABLES[key]).run();
        for (const key of TABLE_KEYS) {
          const rows = key === 'categories' ? parentsFirst(backup.tables[key]) : backup.tables[key];
          for (const row of rows) {
            // Rows come from a file; the database's NOT NULL / foreign keys reject bad ones.
            tx.insert(TABLES[key])
              .values(row as never)
              .run();
          }
        }
      });
    },

    counts(backup: Backup): Record<TableKey, number> {
      return Object.fromEntries(
        TABLE_KEYS.map((key) => [key, backup.tables[key].length]),
      ) as Record<TableKey, number>;
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
