import { eq, sql } from 'drizzle-orm';

import { DATE_FORMATS, type ColumnMapping, type DateFormat } from '@/domain/csv';
import { newId } from '@/utils/id';

import { csvMappings, type CsvMapping } from '../schema';
import type { AppDatabase } from '../types';

/** Columns are stored as their 0-based index in text columns. */
function toColumn(value: string | null): number | null {
  return value != null && /^\d+$/.test(value) ? Number(value) : null;
}

export function rowToMapping(row: CsvMapping): ColumnMapping {
  return {
    hasHeader: row.hasHeader,
    dateCol: toColumn(row.dateCol) ?? 0,
    dateFormat: (DATE_FORMATS as readonly string[]).includes(row.dateFormat)
      ? (row.dateFormat as DateFormat)
      : 'YYYY-MM-DD',
    payeeCol: toColumn(row.payeeCol) ?? 1,
    amountCol: toColumn(row.amountCol),
    debitCol: toColumn(row.debitCol),
    creditCol: toColumn(row.creditCol),
    invertSign: row.invertSign,
  };
}

const column = (n: number | null) => (n == null ? null : String(n));

/** One saved column mapping per institution, reused the next time that bank's file is imported. */
export function createCsvMappingsRepository(db: AppDatabase) {
  const sameInstitution = (institution: string) =>
    sql`${csvMappings.institution} = ${institution.trim()} collate nocase`;

  return {
    findForInstitution(institution: string): (ColumnMapping & { name: string }) | undefined {
      if (institution.trim() === '') return undefined;
      const row = db.select().from(csvMappings).where(sameInstitution(institution)).get();
      return row ? { ...rowToMapping(row), name: row.name } : undefined;
    },

    /** Replace the institution's saved mapping. */
    save(institution: string, name: string, mapping: ColumnMapping): void {
      if (institution.trim() === '') return;
      db.transaction((tx) => {
        tx.delete(csvMappings).where(sameInstitution(institution)).run();
        tx.insert(csvMappings)
          .values({
            id: newId(),
            institution: institution.trim(),
            name,
            dateCol: String(mapping.dateCol),
            dateFormat: mapping.dateFormat,
            payeeCol: String(mapping.payeeCol),
            amountCol: column(mapping.amountCol),
            debitCol: column(mapping.debitCol),
            creditCol: column(mapping.creditCol),
            invertSign: mapping.invertSign,
            hasHeader: mapping.hasHeader,
          })
          .run();
      });
    },

    delete(id: string): void {
      db.delete(csvMappings).where(eq(csvMappings.id, id)).run();
    },
  };
}

export type CsvMappingsRepository = ReturnType<typeof createCsvMappingsRepository>;
